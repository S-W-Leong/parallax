import { useId } from "react";

type ParallaxLogoProps = {
  className?: string;
  title?: string;
};

export function ParallaxLogo({ className, title = "Parallax" }: ParallaxLogoProps) {
  const titleId = useId();

  return (
    <svg className={className} viewBox="0 0 64 64" role="img" aria-labelledby={titleId} focusable="false">
      <title id={titleId}>{title}</title>
      <path className="logo-tri" d="M49.09 18.61 43.94 18.59 29.79 43.22 9.52 9.44 7 14.03 29.72 52.57 49.09 18.61Z" />
      <path className="logo-tri" d="M57 13.87 54.62 9.38 9.5 9.41 29.79 43.21 32.33 38.78 17.64 13.9 57 13.87Z" />
      <path className="logo-tri" d="M35.24 52.62 57 13.88 17.64 13.89 20.42 18.6 49.11 18.59 29.7 52.57 35.24 52.62Z" />
    </svg>
  );
}
