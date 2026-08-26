import { defineModel, field } from '../../core/index.js';

export const Role = defineModel('roles', {
  fields: {
    name: field.string({ required: true, unique: true, indexed: true, maxLength: 100 }),
    description: field.text({ required: false }),
  },
});
