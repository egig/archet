import { defineModel, field } from '../../core/index.js';

/**
 * A named, ranked position a `User` can hold — many users per title, one title per user (the
 * `users` referenceToMany declares the relation; its inverse FK `workTitleId` is auto-injected onto
 * `User`, `auth/models/user.model.ts`). `rank` orders titles by seniority (lower = more senior)
 * without committing to a tree shape (no `parentWorkTitleId`); nothing in the framework enforces
 * or reads an ordering from it yet, it's there for consumer apps/console display to sort/compare
 * on.
 *
 * `workspaceTemplateId` is a `Workspace` (`workspace/models/workspace.model.ts`) built normally
 * through the console — its `WorkspaceView` tabs describe the view a user in this work title
 * should land on. It's required ("mandatory"): every `WorkTitle` must name one, so
 * `workspace/provisioning.ts`'s `createDefaultWorkspace` never has to decide what a
 * work-title-having user without a template should get — see that file for the
 * clone-on-user-create logic this feeds.
 */
export const WorkTitle = defineModel('work_titles', {
  fields: {
    name: field.string({ required: true, unique: true, indexed: true, maxLength: 100 }),
    rank: field.integer({ required: true, displayText: 'Rank' }),
    workspaceTemplateId: field.reference('workspaces', {
      required: true,
      indexed: true,
      displayText: 'Default Workspace',
    }),
    users: field.referenceToMany('users', { inverseColumn: 'workTitleId' }),
  },
  console: { label: 'Work Titles', displayField: 'name' },
});
