const normalizeBase = (input: string): string => {
  const upper = input.toUpperCase();
  const noPunct = upper.replace(/[^A-Z0-9 ]+/g, " ");
  const collapsed = noPunct.replace(/\s+/g, " ").trim();
  return collapsed.replace(/\bLIMITED\b/g, "LTD");
};

export const normalizeCustomer = (input: string): string => {
  return normalizeBase(input);
};

export const normalizeDestination = (input: string): string => {
  return normalizeBase(input);
};

export const extractPostcode = (input: string): string | null => {
  const normalized = normalizeBase(input);

  if (/\bGIR\s*0AA\b/.test(normalized)) {
    return "GIR 0AA";
  }

  const match = normalized.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*([0-9][A-Z]{2})\b/);
  if (!match) {
    return null;
  }

  return `${match[1]} ${match[2]}`;
};

// Examples (unit-test-like):
// normalizeCustomer("  Acme Limited ") => "ACME LTD"
// normalizeCustomer("Acme, Ltd.") => "ACME LTD"
// normalizeDestination("  St. John's  Rd ") => "ST JOHN S RD"
// normalizeDestination("north-west depot") => "NORTH WEST DEPOT"
// extractPostcode("Deliver to SW1A 1AA now") => "SW1A 1AA"
// extractPostcode("Destination: EC1A1BB") => "EC1A 1BB"
// extractPostcode("GIR0AA office") => "GIR 0AA"
// extractPostcode("No postcode here") => null
