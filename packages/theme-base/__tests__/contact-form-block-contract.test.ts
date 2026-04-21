import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  ContactFormPuckConfig,
  ContactFormSchema,
  ContactFormTokens,
  ContactFormClasses,
} from '../blocks/ContactForm';

describe('ContactForm block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/ContactForm');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports ContactFormPuckConfig with required fields', () => {
    expect(ContactFormPuckConfig.label).toBe('Форма обратной связи');
    expect(ContactFormPuckConfig.category).toBe('form');
    expect(ContactFormPuckConfig.defaults.heading).toBe('Связаться с нами');
    expect(ContactFormPuckConfig.defaults.fields.name.enabled).toBe(true);
    expect(ContactFormPuckConfig.defaults.fields.email.required).toBe(true);
    expect(ContactFormPuckConfig.defaults.fields.phone.enabled).toBe(true);
    expect(ContactFormPuckConfig.defaults.fields.message.enabled).toBe(true);
  });

  it('ContactFormSchema parses valid boolean props', () => {
    const ok = ContactFormSchema.safeParse({
      heading: 'Contact',
      description: 'Reach out',
      fields: {
        name: { enabled: true, required: true, label: 'Name' },
        email: { enabled: true, required: true, label: 'Email' },
        phone: { enabled: false, required: false, label: 'Phone' },
        message: { enabled: true, required: false, label: 'Message' },
      },
      buttonText: 'Send',
      colorScheme: 1,
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);
  });

it('ContactFormSchema accepts constructor-style "true"/"false" strings for enabled/required', () => {
    const res = ContactFormSchema.safeParse({
      heading: 'C',
      description: 'D',
      fields: {
        name: { enabled: 'true', required: 'true', label: 'Name' },
        email: { enabled: 'true', required: 'false', label: 'Email' },
        phone: { enabled: 'false', required: 'false', label: 'Phone' },
        message: { enabled: 'true', required: 'false', label: 'Message' },
      },
      buttonText: 'Send',
      colorScheme: 1,
      padding: { top: 0, bottom: 0 },
    });
    expect(res.success).toBe(true);
  });

  it('ContactFormTokens lists error + input/field radius tokens', () => {
    expect(ContactFormTokens.length).toBeGreaterThan(0);
    expect(ContactFormTokens).toContain('--color-error');
    expect(ContactFormTokens).toContain('--radius-input');
    expect(ContactFormTokens).toContain('--radius-field');
  });

  it('ContactFormClasses has root + container + form + field + input + textarea', () => {
    expect(ContactFormClasses.root).toBeDefined();
    expect(ContactFormClasses.container).toBeDefined();
    expect(ContactFormClasses.form).toBeDefined();
    expect(ContactFormClasses.field).toBeDefined();
    expect(ContactFormClasses.input).toBeDefined();
    expect(ContactFormClasses.textarea).toBeDefined();
  });
});
