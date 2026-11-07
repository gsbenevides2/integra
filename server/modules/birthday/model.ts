import { z } from "zod";

/** Days in a month; 2000 is a leap year, so 29/02 is allowed (birthdays repeat yearly). */
export const daysInMonth = (month: number) => new Date(2000, month, 0).getDate();

export const eventBody = z
  .object({
    title: z.string().trim().min(1).meta({
      title: "Title",
      description: "Event title",
      example: "Aniversário de João",
    }),
    month: z.number().int().min(1).max(12).meta({
      title: "Month",
      description: "Month (1-12)",
      example: 5,
    }),
    day: z.number().int().min(1).max(31).meta({
      title: "Day",
      description: "Day of the month (1-31)",
      example: 17,
    }),
  })
  .refine((v) => v.day <= daysInMonth(v.month), {
    message: "Invalid day for the selected month",
    path: ["day"],
  });
export type EventBody = z.infer<typeof eventBody>;
