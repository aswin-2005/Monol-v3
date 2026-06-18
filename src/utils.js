import { FILENAME_INITIALS } from "./config.js";

export function getNewFileName() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  let timestamp =  formatter.format(now)
    .replace(', ', '_')
    .replace(' at ', '_')
    .replace(/ /g, '-')
    .replace(/:/g, '-')
    .toLowerCase();

  return `${FILENAME_INITIALS}${timestamp}`
}