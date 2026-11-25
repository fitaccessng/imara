import { useEffect } from "react";

function positionOpenMenus() {
  const menus = document.querySelectorAll<HTMLDetailsElement>(".file-action-menu[open]");
  for (const menu of menus) {
    const trigger = menu.querySelector<HTMLElement>(":scope > summary");
    const popover = menu.querySelector<HTMLElement>(":scope > .file-action-popover");
    if (!trigger || !popover) continue;

    const anchor = trigger.getBoundingClientRect();
    const right = Math.max(12, window.innerWidth - anchor.right);
    const width = Math.min(
      menu.querySelector(".files-page-action-popover") ? 300 : 260,
      window.innerWidth - 24,
    );
    popover.style.position = "fixed";
    popover.style.boxSizing = "border-box";
    popover.style.width = `${width}px`;
    popover.style.right = `${right}px`;
    popover.style.left = "auto";
    popover.style.bottom = "auto";
    popover.style.top = "12px";
    popover.style.maxHeight = `${Math.max(120, Math.min(520, window.innerHeight - 24))}px`;

    const height = popover.getBoundingClientRect().height;
    const below = anchor.bottom + 5;
    const top = below + height <= window.innerHeight - 12
      ? below
      : Math.max(12, anchor.top - height - 5);
    popover.style.top = `${top}px`;
  }
}

export function useFileActionMenus() {
  useEffect(() => {
    const closeMenusOutsideTarget = (event: PointerEvent) => {
      const target = event.target;
      for (const menu of document.querySelectorAll<HTMLDetailsElement>(".file-action-menu[open]")) {
        if (!(target instanceof Node) || !menu.contains(target)) menu.open = false;
      }
      window.requestAnimationFrame(positionOpenMenus);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const menus = document.querySelectorAll<HTMLDetailsElement>(".file-action-menu[open]");
      if (!menus.length) return;
      event.preventDefault();
      menus.forEach((menu) => {
        menu.open = false;
        menu.querySelector<HTMLElement>(":scope > summary")?.focus();
      });
    };
    const handleToggle = () => window.requestAnimationFrame(positionOpenMenus);

    document.addEventListener("pointerdown", closeMenusOutsideTarget);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("toggle", handleToggle, true);
    window.addEventListener("resize", positionOpenMenus);
    window.addEventListener("scroll", positionOpenMenus, true);
    return () => {
      document.removeEventListener("pointerdown", closeMenusOutsideTarget);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("toggle", handleToggle, true);
      window.removeEventListener("resize", positionOpenMenus);
      window.removeEventListener("scroll", positionOpenMenus, true);
    };
  }, []);
}
