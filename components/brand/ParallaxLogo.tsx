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
      <path className="logo-accent" d="M32 5 56 18.5v27L32 59 8 45.5v-27L32 5Z" />
      <path className="logo-inner" d="M32 18 45 25.5v15L32 48 19 40.5v-15L32 18Z" />
      <path className="logo-line" d="M8 18.5 32 32 56 18.5M8 45.5 32 32 56 45.5M32 5v54" />
      <circle className="logo-core" cx="32" cy="32" r="5.5" />
    </svg>
  );
}
