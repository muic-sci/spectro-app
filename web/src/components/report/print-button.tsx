"use client";

import { Button } from "@heroui/react";
import { Icon } from "@/components/ui/primitives";

/** Triggers the browser print dialog (Save as PDF) for the report. */
export function PrintButton() {
  return (
    <Button variant="primary" onClick={() => window.print()}>
      <Icon name="arrowR" size={16} /> Print / Save PDF
    </Button>
  );
}
