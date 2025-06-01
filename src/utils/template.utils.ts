// src/utils/template.utils.ts
/**
 * Message template utilities for variable substitution and template management
 */

export interface TemplateVariable {
  name: string;
  defaultValue?: string;
  required?: boolean;
  description?: string;
}

export interface MessageTemplate {
  id?: string;
  name: string;
  type: 'text' | 'image' | 'document';
  content: {
    text?: string;
    caption?: string;
    imageUrl?: string;
    documentUrl?: string;
    fileName?: string;
  };
  variables: TemplateVariable[];
  tags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Extract variable names from a message template
 * Supports {{variableName}} syntax
 */
export function extractVariables(content: any): string[] {
  const variables = new Set<string>();
  const pattern = /\{\{(\w+)\}\}/g;
  
  // Check all text fields
  const textFields = [
    content.text,
    content.caption,
    content.fileName,
  ].filter(Boolean);
  
  for (const field of textFields) {
    const matches = field.matchAll(pattern);
    for (const match of matches) {
      variables.add(match[1]);
    }
  }
  
  return Array.from(variables);
}

/**
 * Apply variables to a message template
 * Handles nested objects and arrays
 */
export function applyVariables(
  template: any,
  variables: Record<string, any>,
  contact?: Record<string, any>
): any {
  // Merge contact data with provided variables
  const allVariables = {
    ...contact,
    ...variables,
    // System variables
    date: new Date().toLocaleDateString('id-ID'),
    time: new Date().toLocaleTimeString('id-ID'),
    timestamp: new Date().toISOString(),
  };

  return deepApplyVariables(template, allVariables);
}

/**
 * Recursively apply variables to nested objects
 */
function deepApplyVariables(obj: any, variables: Record<string, any>): any {
  if (typeof obj === 'string') {
    return replaceVariables(obj, variables);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepApplyVariables(item, variables));
  }
  
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepApplyVariables(value, variables);
    }
    return result;
  }
  
  return obj;
}

/**
 * Replace variables in a string
 * Supports {{variable}} and {{variable|default}} syntax
 */
function replaceVariables(text: string, variables: Record<string, any>): string {
  return text.replace(/\{\{(\w+)(?:\|([^}]+))?\}\}/g, (match, varName, defaultValue) => {
    const value = getNestedValue(variables, varName);
    
    if (value !== undefined && value !== null) {
      return String(value);
    }
    
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    
    // Return original if no value found
    return match;
  });
}

/**
 * Get nested object value using dot notation
 * e.g., "user.name" from { user: { name: "John" } }
 */
function getNestedValue(obj: Record<string, any>, path: string): any {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  
  return current;
}

/**
 * Validate variables against template requirements
 */
export function validateVariables(
  template: MessageTemplate,
  providedVariables: Record<string, any>
): { valid: boolean; missing: string[]; errors: string[] } {
  const errors: string[] = [];
  const missing: string[] = [];
  
  for (const variable of template.variables) {
    if (variable.required && !(variable.name in providedVariables)) {
      missing.push(variable.name);
      errors.push(`Required variable '${variable.name}' is missing`);
    }
  }
  
  return {
    valid: errors.length === 0,
    missing,
    errors,
  };
}

/**
 * Create a preview of the template with sample data
 */
export function previewTemplate(
  template: MessageTemplate,
  sampleVariables?: Record<string, any>
): any {
  const defaultVariables: Record<string, any> = {};
  
  // Generate default values for preview
  for (const variable of template.variables) {
    if (variable.defaultValue) {
      defaultVariables[variable.name] = variable.defaultValue;
    } else {
      // Generate sample values based on variable name
      defaultVariables[variable.name] = generateSampleValue(variable.name);
    }
  }
  
  const variables = {
    ...defaultVariables,
    ...sampleVariables,
  };
  
  return applyVariables(template.content, variables);
}

/**
 * Generate sample values for common variable names
 */
function generateSampleValue(varName: string): string {
  const lowerName = varName.toLowerCase();
  
  const samples: Record<string, string> = {
    name: 'John Doe',
    nama: 'Budi Santoso',
    firstname: 'John',
    lastname: 'Doe',
    phone: '6281234567890',
    email: 'example@email.com',
    company: 'PT Example Indonesia',
    perusahaan: 'PT Contoh Indonesia',
    date: new Date().toLocaleDateString('id-ID'),
    tanggal: new Date().toLocaleDateString('id-ID'),
    time: new Date().toLocaleTimeString('id-ID'),
    waktu: new Date().toLocaleTimeString('id-ID'),
    amount: 'Rp 100.000',
    jumlah: 'Rp 100.000',
    product: 'Product Name',
    produk: 'Nama Produk',
    code: 'ABC123',
    kode: 'ABC123',
    link: 'https://example.com',
    address: 'Jl. Contoh No. 123',
    alamat: 'Jl. Contoh No. 123',
  };
  
  // Check exact match
  if (lowerName in samples) {
    return samples[lowerName];
  }
  
  // Check partial matches
  for (const [key, value] of Object.entries(samples)) {
    if (lowerName.includes(key) || key.includes(lowerName)) {
      return value;
    }
  }
  
  // Default
  return `[${varName}]`;
}

/**
 * Parse template string to extract structure
 * Future use for template creation from plain text
 */
export function parseTemplateString(text: string): {
  content: string;
  variables: string[];
} {
  const variables = extractVariables({ text });
  
  return {
    content: text,
    variables,
  };
}

/**
 * Example templates for common use cases
 */
export const exampleTemplates: MessageTemplate[] = [
  {
    name: 'Welcome Message',
    type: 'text',
    content: {
      text: 'Halo {{name|Pelanggan}}, selamat datang di {{company}}! 🎉\n\nTerima kasih telah bergabung dengan kami. Jika ada yang bisa kami bantu, jangan ragu untuk menghubungi kami.',
    },
    variables: [
      { name: 'name', description: 'Customer name', defaultValue: 'Pelanggan' },
      { name: 'company', description: 'Company name', required: true },
    ],
    tags: ['welcome', 'onboarding'],
  },
  {
    name: 'Promo Announcement',
    type: 'image',
    content: {
      caption: '🎁 PROMO SPESIAL untuk {{name}}! 🎁\n\n{{promo_details}}\n\nBerlaku hingga: {{end_date}}\nKode Promo: {{promo_code}}\n\nBuruan sebelum kehabisan!',
    },
    variables: [
      { name: 'name', description: 'Customer name', required: true },
      { name: 'promo_details', description: 'Promotion details', required: true },
      { name: 'end_date', description: 'Promo end date', required: true },
      { name: 'promo_code', description: 'Promo code', defaultValue: 'PROMO2024' },
    ],
    tags: ['promo', 'marketing'],
  },
  {
    name: 'Payment Reminder',
    type: 'text',
    content: {
      text: 'Halo {{name}},\n\nKami ingin mengingatkan bahwa tagihan Anda sebesar {{amount}} akan jatuh tempo pada {{due_date}}.\n\nSilakan lakukan pembayaran sebelum tanggal tersebut untuk menghindari denda keterlambatan.\n\nTerima kasih! 🙏',
    },
    variables: [
      { name: 'name', description: 'Customer name', required: true },
      { name: 'amount', description: 'Payment amount', required: true },
      { name: 'due_date', description: 'Due date', required: true },
    ],
    tags: ['payment', 'reminder'],
  },
];