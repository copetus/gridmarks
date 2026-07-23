"use client";

import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";

type DocumentWithViewTransition = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => {
    finished: Promise<void>;
  };
};

type TransitionLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    children: ReactNode;
  };

function isModifiedEvent(event: MouseEvent<HTMLAnchorElement>) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function hrefToString(href: LinkProps["href"]) {
  if (typeof href === "string") {
    return href;
  }

  const pathname = href.pathname ?? "";
  const search = href.query ? `?${new URLSearchParams(href.query as Record<string, string>).toString()}` : "";
  const hash = href.hash ? `#${href.hash}` : "";

  return `${pathname}${search}${hash}`;
}

export function TransitionLink({
  href,
  children,
  onClick,
  target,
  rel,
  ...rest
}: TransitionLinkProps) {
  const router = useRouter();

  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      {...rest}
      onClick={(event) => {
        onClick?.(event);

        if (
          event.defaultPrevented ||
          isModifiedEvent(event) ||
          event.button !== 0 ||
          target === "_blank"
        ) {
          return;
        }

        const nextHref = hrefToString(href);
        const viewTransitionDocument = document as DocumentWithViewTransition;

        if (!viewTransitionDocument.startViewTransition) {
          event.preventDefault();
          router.push(nextHref);
          return;
        }

        event.preventDefault();
        document.documentElement.classList.add("is-route-transitioning");

        const transition = viewTransitionDocument.startViewTransition(() => {
          startTransition(() => {
            router.push(nextHref);
          });
        });

        transition.finished.finally(() => {
          document.documentElement.classList.remove("is-route-transitioning");
        });
      }}
    >
      {children}
    </Link>
  );
}
