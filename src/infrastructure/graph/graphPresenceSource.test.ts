// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { SignInRequiredError } from '@/application/abstractions/authenticator';
import { PresenceUnavailableError } from '@/application/abstractions/presenceSource';
import { makePresence } from '@/testing/makePresence';
import { GraphRequestError, type GraphClient } from './graphClient';
import { GraphPresenceSource, toPresence } from './graphPresenceSource';

function sourceWith(postJson: (path: string, body: { ids: string[] }) => Promise<unknown>) {
  const spy = vi.fn(postJson);
  return { source: new GraphPresenceSource({ postJson: spy } as unknown as GraphClient), spy };
}

/** Out of office in Outlook, with `message` as the automatic reply. */
const away = (message: string | null) =>
  toPresence({ id: 'a', availability: 'Away', activity: 'OutOfOffice', outOfOfficeSettings: { isOutOfOffice: true, message } });

/** Available, with `content` as the note set in Teams. */
const noted = (content: string, contentType = 'text') =>
  toPresence({ id: 'a', availability: 'Available', activity: 'Available', statusMessage: { message: { content, contentType } } });

describe('GraphPresenceSource', () => {
  it('asks for at most 650 people per request', async () => {
    const { source, spy } = sourceWith((_path, { ids }) =>
      Promise.resolve({ value: ids.map((id) => ({ id, availability: 'Available', activity: 'Available' })) }),
    );
    const ids = Array.from({ length: 1300 }, (_, index) => `user${String(index)}`);

    const presences = await source.getPresences(ids);

    expect(spy.mock.calls.map(([path, body]) => [path, body.ids.length])).toEqual([
      ['/communications/getPresencesByUserId', 650],
      ['/communications/getPresencesByUserId', 650],
    ]);
    expect(presences.size).toBe(1300);
  });

  it('turns a missing permission into PresenceUnavailableError, but not other failures', async () => {
    const denied = sourceWith(() => Promise.reject(new GraphRequestError(403, 'Forbidden', 'denied')));
    const noConsent = sourceWith(() => Promise.reject(new SignInRequiredError()));
    const outage = sourceWith(() => Promise.reject(new GraphRequestError(500, null, 'boom')));

    await expect(denied.source.getPresences(['a'])).rejects.toBeInstanceOf(PresenceUnavailableError);
    await expect(noConsent.source.getPresences(['a'])).rejects.toBeInstanceOf(PresenceUnavailableError);
    await expect(outage.source.getPresences(['a'])).rejects.toBeInstanceOf(GraphRequestError);
  });

  it('reads the note, the automatic reply and the work location from the reply it already fetches', async () => {
    const { source } = sourceWith(() =>
      Promise.resolve({
        value: [
          {
            id: 'a',
            availability: 'Offline',
            activity: 'OutOfOffice',
            outOfOfficeSettings: { isOutOfOffice: true, message: '<p>On holiday</p>' },
            statusMessage: { message: { content: 'Back on Monday', contentType: 'text' } },
            workLocation: { workLocationType: 'timeOff', source: 'scheduled' },
          },
        ],
      }),
    );

    expect((await source.getPresences(['a'])).get('a')).toEqual(
      makePresence({
        availability: 'offline',
        activity: 'OutOfOffice',
        outOfOffice: true,
        outOfOfficeMessage: 'On holiday',
        statusMessage: 'Back on Monday',
        workLocation: 'timeOff',
      }),
    );
  });
});

describe('toPresence', () => {
  it('maps Graph availability and keeps only activities that add information', () => {
    expect(toPresence({ id: 'a', availability: 'BusyIdle', activity: 'InAMeeting' })).toEqual(
      makePresence({ availability: 'busy', activity: 'InAMeeting' }),
    );
    expect(toPresence({ id: 'a', availability: 'Available', activity: 'Available' }).activity).toBeNull();
    expect(toPresence({ id: 'a', availability: 'BeRightBack', activity: 'BeRightBack' })).toEqual(
      makePresence({ availability: 'away', activity: 'BeRightBack' }),
    );
    expect(toPresence({ id: 'a', availability: 'PresenceUnknown', activity: 'PresenceUnknown' }).availability).toBe('unknown');
  });

  it('reports out of office from the settings or the activity', () => {
    expect(toPresence({ id: 'a', availability: 'Offline', activity: 'Offline', outOfOfficeSettings: { isOutOfOffice: true } }).outOfOffice).toBe(true);
    expect(toPresence({ id: 'a', availability: 'Offline', activity: 'OutOfOffice' }).outOfOffice).toBe(true);
  });

  it('turns an automatic reply written in Outlook into plain text on one line, without its styles or scripts', () => {
    const html =
      '<html><head><style>p { margin: 0 }</style></head><body><p>Thank you for your message.</p>' +
      '<div>I am away&nbsp;until <b>Monday</b>.<br>Best regards,<br>Kari</div><script>alert(1)</script></body></html>';

    expect(away(html).outOfOfficeMessage).toBe('Thank you for your message. I am away until Monday. Best regards, Kari');
    expect(away('Plain text,\n\non two lines').outOfOfficeMessage).toBe('Plain text, on two lines');
  });

  it('cuts a long automatic reply to 1,000 characters, and says so', () => {
    const text = 'All work and no play. '.repeat(100).trim();

    const reply = away(`<p>${text}</p>`).outOfOfficeMessage;

    expect(reply).toBe(`${text.slice(0, 997)}...`);
    expect(reply).toHaveLength(1000);
  });

  it('keeps an automatic reply only while the person is out of office', () => {
    const later = toPresence({
      id: 'a',
      availability: 'Available',
      activity: 'Available',
      outOfOfficeSettings: { isOutOfOffice: false, message: '<p>On holiday next week</p>' },
    });

    expect(later.outOfOffice).toBe(false);
    expect(later.outOfOfficeMessage).toBeNull();
  });

  it('keeps the note set in Teams as its text, cut to the 280 characters Teams allows', () => {
    expect(noted('  Back <after> lunch\n').statusMessage).toBe('Back <after> lunch');
    expect(noted('<p>In the <b>Oslo</b> office</p>', 'html').statusMessage).toBe('In the Oslo office');
    const long = noted('x'.repeat(300)).statusMessage;
    expect(long).toHaveLength(280);
    expect(long?.endsWith('...')).toBe(true);
  });

  it('gives null for whatever Graph leaves out, sends empty, or leaves without text', () => {
    expect(
      toPresence({
        id: 'a',
        availability: 'Available',
        activity: 'Available',
        outOfOfficeSettings: null,
        statusMessage: { message: { content: '', contentType: 'text' } },
        workLocation: null,
      }),
    ).toEqual(makePresence());
    expect(away('<p>&nbsp;</p><style>p { color: red }</style>').outOfOfficeMessage).toBeNull();
    expect(away(null).outOfOfficeMessage).toBeNull();
    expect(noted('   ').statusMessage).toBeNull();
  });

  it('says whether the person works in the office, remotely or not at all today, and nothing for other locations', () => {
    const at = (workLocationType: string | null) =>
      toPresence({ id: 'a', availability: 'Available', activity: 'Available', workLocation: { workLocationType } }).workLocation;

    expect([at('office'), at('remote'), at('timeOff')]).toEqual(['office', 'remote', 'timeOff']);
    expect([at('unspecified'), at('unknownFutureValue'), at(null)]).toEqual([null, null, null]);
  });
});
