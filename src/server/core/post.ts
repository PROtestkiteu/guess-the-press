import { reddit } from "@devvit/web/server";

export async function createPost() {
  return await reddit.submitCustomPost({
    title: "Guess The Press",
  });
}
