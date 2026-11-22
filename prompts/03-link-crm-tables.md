# Tutorial 03: Link Your CRM Tables With One Prompt

This prompt grows the WorkGetsDone app into a small CRM: companies, contacts, projects, tasks, calls and notes, linked together, private to your team, with sample data.

It continues the app from [Tutorial 02](02-build-a-table.md), in the same assistant session. Paste this prompt:

```text
WorkGetsDone already has one table, Companies, with three companies in it. Now build out the rest of it properly, the way a consulting business actually needs to track its work.

I need these, each with its own table:

- Companies: name, industry, website, phone number, and whether they're archived.
- Contacts: first name, last name, email, phone number, job title, and whether they're still active.
- Projects: name, status, start date, due date, and whether they're archived.
- Tasks: name, status, priority, due date, whether it's billable, and how many minutes it's estimated to take versus how many it actually took.
- Calls: subject, direction (incoming or outgoing), when it started and when it ended, and whether it's billable.
- Notes: the note itself, and whether it's archived.

Link them up like this: every project belongs to one company. Every task belongs to one project. A contact can be linked to more than one company; for each link, record their role there and whether they're the main contact at that company, and the same person shouldn't be linked twice to the same company. A call or a note should be able to be filed against whichever one thing it's actually about: a company, a contact, a project, or a task.

Only people on my team who are signed in should be able to see any of this. Nothing here is public, and nothing should be reachable automatically from outside.

Add enough sample data that nothing is empty: at least five companies in total, most of them with a contact or two; a few projects with tasks and a call or two on them; and at least one note somewhere.

When it's done, read the whole thing back to me and confirm every table, every field and every link is there, and tell me plainly if anything on this list couldn't be built the way I described it.
```
