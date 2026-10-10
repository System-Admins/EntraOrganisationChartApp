import { WEB_PART_MESSAGES } from '../../generated/webPartMessages';
import { ChartBridge } from './chartBridge';

const CHART = 'https://chart.contoso.com';
const USER = { id: 'anna', displayName: 'Anna', userPrincipalName: 'anna@contoso.com', isGuest: false };

let frame: HTMLIFrameElement;
let chart: Window;
let bridge: ChartBridge;
const graphToken = jest.fn((fresh: boolean) => Promise.resolve(fresh ? 'fresh' : 'cached'));
const posted = jest.fn();

/** What the window in the frame, or `source`, posts to the web part's page. */
function request(data: unknown, source: unknown = chart, origin: string = CHART): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }));
}

const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  frame = document.createElement('iframe');
  document.body.appendChild(frame);
  if (!frame.contentWindow) throw new Error('jsdom gave the frame no window.');
  chart = frame.contentWindow;
  jest.spyOn(chart, 'postMessage').mockImplementation(posted);
  bridge = new ChartBridge(frame, CHART, { user: USER, locale: 'en-US', graphToken });
});

afterEach(() => {
  bridge.dispose();
  frame.remove();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('ChartBridge', () => {
  it('tells the chart in its frame who is viewing the page, and in what language', () => {
    request({ type: WEB_PART_MESSAGES.hello });

    expect(posted).toHaveBeenCalledWith({ type: WEB_PART_MESSAGES.hello, user: USER, locale: 'en-US' }, CHART);
  });

  it("hands the chart a token, a fresh one where it asks for that, for the chart's site alone", async () => {
    request({ type: WEB_PART_MESSAGES.token, id: 3, fresh: true });
    await settled();

    expect(graphToken).toHaveBeenCalledWith(true);
    expect(posted).toHaveBeenCalledWith({ type: WEB_PART_MESSAGES.token, id: 3, token: 'fresh' }, CHART);
  });

  it("passes on SharePoint's own words where it has no token", async () => {
    graphToken.mockRejectedValueOnce(new Error('AADSTS65001: The user or administrator has not consented.'));

    request({ type: WEB_PART_MESSAGES.token, id: 4, fresh: false });
    await settled();

    expect(posted).toHaveBeenCalledWith(
      { type: WEB_PART_MESSAGES.token, id: 4, error: 'AADSTS65001: The user or administrator has not consented.' },
      CHART,
    );
  });

  it('answers no other window, no other site and nothing that is no request', async () => {
    request({ type: WEB_PART_MESSAGES.token, id: 1, fresh: false }, window);
    request({ type: WEB_PART_MESSAGES.token, id: 1, fresh: false }, chart, 'https://fabrikam.example');
    request({ type: WEB_PART_MESSAGES.token, id: '1', fresh: false });
    request('orgapp.webPart.token');
    await settled();

    expect(graphToken).not.toHaveBeenCalled();
    expect(posted).not.toHaveBeenCalled();
  });

  it('listens no more once disposed', () => {
    bridge.dispose();

    request({ type: WEB_PART_MESSAGES.hello });

    expect(posted).not.toHaveBeenCalled();
  });
});
