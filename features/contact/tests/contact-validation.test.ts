import { describe, it, expect } from "vitest";
import { z } from "zod";

// Copy of the contact schema from app/api/contact/route.ts
// Tested in isolation to avoid importing the full route handler
const contactSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(4).max(40),
  email: z.string().trim().email().max(320),
  message: z.string().trim().min(10).max(1000),
  captcha: z.string().min(10),
});

const validInput = {
  firstName: "John",
  lastName: "Doe",
  phone: "+1234567890",
  email: "john@example.com",
  message: "Hello, I'd like to learn more about LoveIQ.",
  captcha: "03AGdBq24PBCgJ_valid_captcha_token",
};

describe("contact validation schema", () => {
  it("accepts valid input", () => {
    const result = contactSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects missing firstName", () => {
    const { firstName: _, ...input } = validInput;
    const result = contactSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects empty firstName", () => {
    const result = contactSchema.safeParse({ ...validInput, firstName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only firstName (trimmed)", () => {
    const result = contactSchema.safeParse({ ...validInput, firstName: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects missing lastName", () => {
    const { lastName: _, ...input } = validInput;
    const result = contactSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const { email: _, ...input } = validInput;
    const result = contactSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = contactSchema.safeParse({ ...validInput, email: "not-email" });
    expect(result.success).toBe(false);
  });

  it("rejects phone shorter than 4 characters", () => {
    const result = contactSchema.safeParse({ ...validInput, phone: "123" });
    expect(result.success).toBe(false);
  });

  it("rejects phone longer than 40 characters", () => {
    const result = contactSchema.safeParse({
      ...validInput,
      phone: "1".repeat(41),
    });
    expect(result.success).toBe(false);
  });

  it("rejects message shorter than 10 characters", () => {
    const result = contactSchema.safeParse({ ...validInput, message: "Hi" });
    expect(result.success).toBe(false);
  });

  it("rejects message longer than 1000 characters", () => {
    const result = contactSchema.safeParse({
      ...validInput,
      message: "x".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects captcha shorter than 10 characters", () => {
    const result = contactSchema.safeParse({ ...validInput, captcha: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects missing captcha", () => {
    const { captcha: _, ...input } = validInput;
    const result = contactSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("trims whitespace from string fields", () => {
    const result = contactSchema.safeParse({
      ...validInput,
      firstName: "  John  ",
      lastName: "  Doe  ",
      email: "  john@example.com  ",
      message: "  Hello, this is a test message.  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe("John");
      expect(result.data.lastName).toBe("Doe");
      expect(result.data.email).toBe("john@example.com");
      expect(result.data.message).toBe("Hello, this is a test message.");
    }
  });

  it("rejects firstName exceeding max length", () => {
    const result = contactSchema.safeParse({
      ...validInput,
      firstName: "A".repeat(121),
    });
    expect(result.success).toBe(false);
  });
});
