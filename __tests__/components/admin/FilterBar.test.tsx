// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, afterEach } from "vitest";
import FilterBar from "@/components/admin/FilterBar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FilterBar", () => {
  it("renders status select, archetype select, email input, and date inputs", () => {
    const onFilterChange = vi.fn();
    render(<FilterBar onFilterChange={onFilterChange} />);

    expect(screen.getByRole("combobox", { name: /filter by status/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /filter by archetype/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/from date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/to date/i)).toBeInTheDocument();
  });

  it("status change calls onFilterChange after debounce", async () => {
    vi.useFakeTimers();
    const onFilterChange = vi.fn();
    render(<FilterBar onFilterChange={onFilterChange} />);

    // Clear initial effect call
    act(() => {
      vi.advanceTimersByTime(300);
    });
    onFilterChange.mockClear();

    const select = screen.getByRole("combobox", { name: /filter by status/i });
    fireEvent.change(select, { target: { value: "completed" } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });

  it("email input debounces before calling onFilterChange", async () => {
    const onFilterChange = vi.fn();
    render(<FilterBar onFilterChange={onFilterChange} />);

    const emailInput = screen.getByPlaceholderText(/search email/i);
    fireEvent.change(emailInput, { target: { value: "test@test.com" } });

    // Wait for the 300ms debounce to fire
    await waitFor(
      () => {
        const calls = onFilterChange.mock.calls;
        const lastCall = calls[calls.length - 1]?.[0];
        expect(lastCall?.email).toBe("test@test.com");
      },
      { timeout: 1000 }
    );
  });

  it("date filter change calls onFilterChange with new dates", async () => {
    const onFilterChange = vi.fn();
    render(<FilterBar onFilterChange={onFilterChange} />);

    const dateFromInput = screen.getByLabelText(/from date/i);
    fireEvent.change(dateFromInput, { target: { value: "2025-01-01" } });

    await waitFor(
      () => {
        const calls = onFilterChange.mock.calls;
        const lastCall = calls[calls.length - 1]?.[0];
        expect(lastCall?.dateFrom).toBe("2025-01-01");
      },
      { timeout: 1000 }
    );
  });

  it("archetype change calls onFilterChange after debounce", async () => {
    vi.useFakeTimers();
    const onFilterChange = vi.fn();
    render(<FilterBar onFilterChange={onFilterChange} />);

    // Clear initial effect call
    act(() => {
      vi.advanceTimersByTime(300);
    });
    onFilterChange.mockClear();

    const select = screen.getByRole("combobox", { name: /filter by archetype/i });
    fireEvent.change(select, { target: { value: "Spark Seeker" } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ archetype: "Spark Seeker" })
    );
  });

  it("cleans up debounce timer on unmount", () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const onFilterChange = vi.fn();
    const { unmount } = render(<FilterBar onFilterChange={onFilterChange} />);

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
