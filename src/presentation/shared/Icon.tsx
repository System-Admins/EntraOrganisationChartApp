const PATHS = {
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM20 20l-4.9-4.9',
  expandAll: 'M12 3v6M9 6l3-3 3 3M12 21v-6M9 18l3 3 3-3M5 12h14',
  collapseAll: 'M12 3v6M9 6l3 3 3-3M12 21v-6M9 18l3-3 3 3M5 12h14',
  zoomIn: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM20 20l-4.9-4.9M7.5 10.5h6M10.5 7.5v6',
  zoomOut: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM20 20l-4.9-4.9M7.5 10.5h6',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v5h-5',
  print: 'M7 9V4h10v5M7 17H5.5A1.5 1.5 0 0 1 4 15.5v-5A1.5 1.5 0 0 1 5.5 9h13a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17M7 14h10v6H7z',
  mail: 'M4 6.5h16v11H4zM4.5 7l7.5 6 7.5-6',
  reply: 'M9.5 7 4.5 12l5 5M4.5 12H14a5.5 5.5 0 0 1 5.5 5.5v1',
  phone:
    'M7 4h3l1.5 4-2 1.3a10 10 0 0 0 5.2 5.2L16 12.5l4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 5 6a2 2 0 0 1 2-2Z',
  chevronDown: 'M7 10l5 5 5-5',
  chevronUp: 'M7 14l5-5 5 5',
  chevronLeft: 'M14.5 7l-5 5 5 5',
  chevronRight: 'M9.5 7l5 5-5 5',
  departments: 'M9.5 3.5h5v4h-5zM3.5 16.5h5v4h-5zM15.5 16.5h5v4h-5zM12 7.5V12M6 16.5V12h12v4.5',
  warning: 'M12 4.5 20.5 19h-17L12 4.5ZM12 10v4M12 16.5v.5',
  chat: 'M4.5 5.5h15v10h-9l-6 4.5v-14.5ZM8.5 9.5h7M8.5 12.5h4',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  mobile: 'M8 3h8v18H8zM11 18h2',
  location: 'M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  clock: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 7.5V12l3 2',
  calendar: 'M4.5 6h15v14h-15zM4.5 10.5h15M8.5 3.5v4M15.5 3.5v4',
  building: 'M5 20.5V4h9v16.5M14 9h5v11.5M8 8h3M8 12h3M8 16h3M3 20.5h18',
  work: 'M4 8.5h16V19H4zM9 8.5v-2A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5v2M4 13h16',
  badge: 'M4 6h16v12H4zM7.5 10.5h3M7.5 13.5h5M15 10h2v4h-2z',
  tag: 'M4 4h7l9 9-7 7-9-9V4ZM8 7.75v.5',
  person: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5 20c.6-4 3.4-6 7-6s6.4 2 7 6',
  team: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 19c.5-3.5 3-5 6-5s5.5 1.5 6 5M16 5.5a3 3 0 0 1 0 5.6M18 14c1.8.6 2.8 2.2 3 5',
  link: 'M9.5 14.5l5-5M8 11l-2 2a3.54 3.54 0 0 0 5 5l2-2M16 13l2-2a3.54 3.54 0 0 0-5-5l-2 2',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  copy: 'M9 9h11v11H9zM15 9V4H4v11h5',
  download: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14',
  signOut: 'M9 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H9M15 16l4-4-4-4M19 12H10',
  levels: 'M4 5.5h8M8 12h8M12 18.5h8M6 5.5v6.5h2M10 12v6.5h2',
  external: 'M13 5h6v6M19 5l-8 8M10 6H6.5A1.5 1.5 0 0 0 5 7.5v10A1.5 1.5 0 0 0 6.5 19h10a1.5 1.5 0 0 0 1.5-1.5V14',
  settings:
    'M10.1 4.8l.4-2.6h3l.4 2.6 1.9.8L17.9 4 20 6.1l-1.6 2.1.8 1.9 2.6.4v3l-2.6.4-.8 1.9 1.6 2.1-2.1 2.1-2.1-1.6-1.9.8-.4 2.6h-3l-.4-2.6-1.9-.8L6.1 20 4 17.9l1.6-2.1-.8-1.9-2.6-.4v-3l2.6-.4.8-1.9L4 6.1 6.1 4l2.1 1.6ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  help: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 16.5v.5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
