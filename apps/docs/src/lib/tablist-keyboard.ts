export const setupTablistKeyboard = (
  tablist: HTMLElement,
  tabSelector: string,
  getTabId: (tab: HTMLButtonElement) => string | undefined,
  setActiveTab: (tabId: string) => void
) => {
  const getTabs = () => [
    ...tablist.querySelectorAll<HTMLButtonElement>(tabSelector),
  ];

  tablist.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }

    const tabs = getTabs();
    const activeTab =
      document.activeElement instanceof HTMLButtonElement
        ? document.activeElement
        : null;
    const currentIndex = activeTab ? tabs.indexOf(activeTab) : -1;

    if (currentIndex === -1) {
      return;
    }

    let nextIndex = currentIndex;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();

    const nextTab = tabs[nextIndex];
    if (!nextTab) {
      return;
    }

    nextTab.focus();

    const tabId = getTabId(nextTab);
    if (tabId) {
      setActiveTab(tabId);
    }
  });
};
