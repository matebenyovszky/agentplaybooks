/**
 * Brand marks, drawn here rather than imported.
 *
 * lucide-react 1.x dropped `Github`, `Twitter` and `Linkedin` — brand logos are
 * trademarks, and an icon set that redraws them in its own stroke style is
 * redrawing someone else's mark. The rest of the UI still comes from lucide;
 * only these three live here, as the official monochrome glyphs.
 *
 * They take the same props as a lucide icon (`className` for sizing and
 * colour), so call sites did not change beyond the import: `currentColor` and
 * a `1em` box mean `h-4 w-4` and a text colour still work exactly as before.
 */

import type { SVGProps } from "react";

type BrandIconProps = SVGProps<SVGSVGElement>;

function BrandIcon({ children, ...props }: BrandIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function GithubIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.05-.02-2.06-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.9-.01 3.29 0 .32.21.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5Z" />
    </BrandIcon>
  );
}

export function TwitterIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M23.64 4.57a9.6 9.6 0 0 1-2.72.75 4.74 4.74 0 0 0 2.08-2.62c-.92.55-1.94.94-3.02 1.15a4.72 4.72 0 0 0-8.06 4.31A13.41 13.41 0 0 1 1.7 3.15a4.72 4.72 0 0 0 1.46 6.31 4.68 4.68 0 0 1-2.14-.6v.06a4.73 4.73 0 0 0 3.79 4.64 4.75 4.75 0 0 1-2.13.08 4.73 4.73 0 0 0 4.42 3.28A9.48 9.48 0 0 1 0 19.1a13.37 13.37 0 0 0 7.25 2.13c8.7 0 13.46-7.21 13.46-13.46l-.02-.61a9.6 9.6 0 0 0 2.36-2.45Z" />
    </BrandIcon>
  );
}

export function LinkedinIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z" />
    </BrandIcon>
  );
}
