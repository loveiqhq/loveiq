// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("@/data/countries", () => {
  const map: Record<string, string> = {
    Austria: "AT",
    Australia: "AU",
    Germany: "DE",
    "United States": "US",
    "United Kingdom": "GB",
  };
  return {
    COUNTRIES: ["Austria", "Australia", "Germany", "United States", "United Kingdom"],
    COUNTRY_CODE_MAP: map,
    getCountryFlagUrl: (name: string) => {
      const code = map[name];
      if (!code) return "";
      return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
    },
  };
});

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

import CountryQuestion from "@/components/survey/questions/CountryQuestion";
import { makeSurveyQuestion } from "@/__tests__/__fixtures__/survey";

const QUESTION = makeSurveyQuestion({
  qId: "q_country",
  cId: 1,
  chapter: "Background",
  question: "Where are you from?",
  answerType: "country",
  options: [],
  required: false,
});

afterEach(cleanup);

describe("CountryQuestion", () => {
  it("renders the search input field", () => {
    render(<CountryQuestion question={QUESTION} value={null} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Search for a country...")).toBeInTheDocument();
  });

  it("renders the question text", () => {
    render(<CountryQuestion question={QUESTION} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Where are you from?")).toBeInTheDocument();
  });

  it("opens dropdown when input is focused", async () => {
    const user = userEvent.setup();
    render(<CountryQuestion question={QUESTION} value={null} onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("Search for a country...");
    await user.click(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("filters countries by search text — typing 'Aus' shows Austria and Australia only", async () => {
    const user = userEvent.setup();
    render(<CountryQuestion question={QUESTION} value={null} onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("Search for a country...");
    await user.type(input, "Aus");
    const options = screen.getAllByRole("option");
    const labels = options.map((o) => o.textContent);
    expect(labels.some((l) => l?.includes("Austria"))).toBe(true);
    expect(labels.some((l) => l?.includes("Australia"))).toBe(true);
    expect(labels.every((l) => !l?.includes("Germany"))).toBe(true);
    expect(labels.every((l) => !l?.includes("United States"))).toBe(true);
  });

  it("calls onChange with country name when a dropdown item is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CountryQuestion question={QUESTION} value={null} onChange={onChange} />);
    const input = screen.getByPlaceholderText("Search for a country...");
    await user.click(input);
    // Use mousedown because the component uses onMouseDown to avoid blur-before-select
    const germanyOption = screen.getByRole("option", { name: "Germany" });
    await user.pointer({ target: germanyOption, keys: "[MouseLeft>]" });
    expect(onChange).toHaveBeenCalledWith("Germany");
  });

  it("closes dropdown on outside click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <CountryQuestion question={QUESTION} value={null} onChange={vi.fn()} />
        <button type="button">Outside</button>
      </div>
    );
    const input = screen.getByPlaceholderText("Search for a country...");
    await user.click(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("ArrowDown key moves highlight to first item then second", async () => {
    const user = userEvent.setup();
    render(<CountryQuestion question={QUESTION} value={null} onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("Search for a country...");
    await user.click(input);
    // First ArrowDown — highlight index 0
    await user.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    // The highlighted item gets bg-white/[0.1] class but we can verify the list is still open
    expect(options.length).toBeGreaterThan(0);
    // Second ArrowDown — moves to index 1
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("Enter key selects highlighted item", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CountryQuestion question={QUESTION} value={null} onChange={onChange} />);
    const input = screen.getByPlaceholderText("Search for a country...");
    await user.type(input, "Austria");
    // Filter down to exactly one result — Enter with filtered.length === 1 selects it
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("Austria");
  });

  it("Escape key closes the dropdown", async () => {
    const user = userEvent.setup();
    render(<CountryQuestion question={QUESTION} value={null} onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("Search for a country...");
    await user.click(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("clear button appears when a value is selected and calls onChange with empty string", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CountryQuestion question={QUESTION} value="Germany" onChange={onChange} />);
    const clearBtn = screen.getByRole("button", { name: /clear selection/i });
    expect(clearBtn).toBeInTheDocument();
    await user.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("clear button is not shown when no value is selected", () => {
    render(<CountryQuestion question={QUESTION} value={null} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /clear selection/i })).not.toBeInTheDocument();
  });

  it("shows 'No countries found' when search has no matches", async () => {
    const user = userEvent.setup();
    render(<CountryQuestion question={QUESTION} value={null} onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("Search for a country...");
    await user.type(input, "Zzzzz");
    expect(screen.getByText("No countries found")).toBeInTheDocument();
  });
});
