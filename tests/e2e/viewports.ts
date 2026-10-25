export type ViewportCase = {
  name: string;
  width: number;
  height: number;
};

export const PHONE_VIEWPORTS: ViewportCase[] = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPhone 16 Pro", width: 402, height: 874 },
  { name: "iPhone 16 Pro Max", width: 440, height: 956 },
  { name: "Pixel 8 / Galaxy S24", width: 412, height: 915 },
];

export const TABLET_VIEWPORTS: ViewportCase[] = [
  { name: "iPad mini", width: 768, height: 1024 },
  { name: "iPad Air", width: 820, height: 1180 },
  { name: "iPad Pro", width: 1024, height: 1366 },
];

export const ALL_VIEWPORTS: ViewportCase[] = [...PHONE_VIEWPORTS, ...TABLET_VIEWPORTS];

export function orientationsOf(viewport: ViewportCase): ViewportCase[] {
  return [
    { name: `${viewport.name} portrait`, width: viewport.width, height: viewport.height },
    { name: `${viewport.name} landscape`, width: viewport.height, height: viewport.width },
  ];
}
