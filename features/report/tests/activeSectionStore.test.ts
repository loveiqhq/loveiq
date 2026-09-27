import { describe, expect, it, vi } from "vitest";
import { createActiveSectionStore } from "@features/report/ui/activeSectionStore";

/**
 * The chapter the navs mark as current (Fatih, 27.09: "the entire page is laggy"). The
 * scroll-spy sets it on every frame it scrolls, so setting the chapter that is already
 * current must wake no one.
 */
describe("createActiveSectionStore", () => {
  it("starts on the chapter it is given", () => {
    expect(createActiveSectionStore("core_archetype").get()).toBe("core_archetype");
  });

  it("tells its listeners when the chapter changes, and only then", () => {
    const store = createActiveSectionStore("core_archetype");
    const listener = vi.fn();
    store.subscribe(listener);

    store.set("core_archetype");
    expect(listener).not.toHaveBeenCalled();

    store.set("snapshot");
    expect(store.get()).toBe("snapshot");
    expect(listener).toHaveBeenCalledTimes(1);

    store.set("snapshot");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops telling a listener once it unsubscribes", () => {
    const store = createActiveSectionStore("core_archetype");
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set("map");
    expect(listener).not.toHaveBeenCalled();
    expect(store.get()).toBe("map");
  });
});
