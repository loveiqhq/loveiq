// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import ConfirmDialog from "@/components/admin/ConfirmDialog";

afterEach(cleanup);

describe("ConfirmDialog", () => {
  it("returns null when open is false", () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Test"
        message="Test message"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders title and message when open", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText("Delete Item")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("uses default confirm label 'Confirm'", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Test"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  it("uses custom confirm label", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Test"
        confirmLabel="Delete permanently"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Delete permanently" })).toBeInTheDocument();
  });

  it("calls onConfirm when confirm clicked (no requireTyped)", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Test"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Test"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("confirm button disabled until typed text matches requireTyped", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Test"
        requireTyped="DELETE"
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("confirm button enabled after typing correct text", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Test"
        requireTyped="DELETE"
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText("DELETE"), "DELETE");
    expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled();
  });

  it("shows typed confirmation prompt", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Test"
        requireTyped="CLOSE SURVEY"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/To confirm, type/)).toBeInTheDocument();
    expect(screen.getByText('"CLOSE SURVEY"')).toBeInTheDocument();
  });
});
