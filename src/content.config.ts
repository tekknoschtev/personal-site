import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Adding content = dropping a markdown file in src/content/<collection>/.
 * The file body is the writeup/description; frontmatter is validated
 * against the schemas below at build time.
 */

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    tagline: z.string(),
    // where the live thing runs; omit for not-yet-public projects,
    // whose card links to the writeup page instead
    url: z.string().url().optional(),
    repo: z.string().url().optional(),
    tech: z.array(z.string()).default([]),
    // Uptime Kuma monitor name — links this card to the status board.
    // Omit for projects that aren't hosted anywhere.
    monitor: z.string().optional(),
    // lower = earlier on the wall
    order: z.number().default(99),
  }),
});

const workshop = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/workshop' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      caption: z.string(),
      // e.g. "walnut & maple", "red oak"
      medium: z.string().optional(),
      image: image().optional(),
      date: z.date().optional(),
      order: z.number().default(99),
    }),
});

const art = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/art' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      caption: z.string().optional(),
      // e.g. "soft pastel", "spray paint on canvas", "graphite"
      medium: z.string().optional(),
      image: image().optional(),
      date: z.date().optional(),
      order: z.number().default(99),
    }),
});

const sky = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/sky' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      // what's in the frame, e.g. "M42 — Orion Nebula"
      target: z.string().optional(),
      caption: z.string().optional(),
      image: image().optional(),
      date: z.date().optional(),
      // camera / scope / mount / exposure notes, free-form
      gear: z.string().optional(),
    }),
});

const log = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/log' }),
  schema: z.object({
    date: z.date(),
    // optional one-liner headline; the body is the entry
    title: z.string().optional(),
  }),
});

export const collections = { projects, workshop, art, sky, log };
