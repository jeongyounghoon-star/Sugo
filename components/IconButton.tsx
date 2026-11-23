"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 아이용 큰 동그란 버튼 (최소 64px). 글을 못 읽어도 알 수 있게 그림만 보여주고,
 * 어른/보조기기를 위해 aria-label을 단다.
 */
interface BaseProps {
  label: string;
  children: ReactNode;
  size?: "md" | "lg" | "xl";
  color?: string;
  className?: string;
}

const SIZES = {
  md: "h-16 w-16 text-3xl",
  lg: "h-20 w-20 text-4xl",
  xl: "h-28 w-28 text-6xl",
};

function classes(size: BaseProps["size"], className = "") {
  return `inline-flex shrink-0 items-center justify-center rounded-full border-b-4 border-black/15 shadow-lg transition active:translate-y-1 active:border-b-0 select-none ${SIZES[size ?? "md"]} ${className}`;
}

export function IconButton({
  label,
  children,
  size,
  color = "#ffffff",
  className,
  onClick,
  disabled,
}: BaseProps & { onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={classes(size, `${className ?? ""} disabled:opacity-40`)}
      style={{ backgroundColor: color }}
    >
      {children}
    </button>
  );
}

export function IconLink({
  label,
  children,
  size,
  color = "#ffffff",
  className,
  href,
  onClick,
}: BaseProps & { href: string; onClick?: () => void }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={classes(size, className)}
      style={{ backgroundColor: color }}
    >
      {children}
    </Link>
  );
}
