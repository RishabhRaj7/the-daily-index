"use client";

import { createContext } from "react";

// The stories new since the reader's last visit, by their address
// (widgets/CatchUp.tsx), for a small "New" beside the source (story/StoryArticle.tsx).
export const NO_NEW_STORIES: ReadonlySet<string> = new Set();
export const NewStories = createContext<ReadonlySet<string>>(NO_NEW_STORIES);
