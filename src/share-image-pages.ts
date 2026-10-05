export const IMAGE_WIDTH = 1080, IMAGE_MAX_HEIGHT = 2600, IMAGE_MIN_HEIGHT = 640;
export type MeasuredMessage = { id: string; height: number; breaks: number[] };
export type ImageSlice = { id: string; offset: number; height: number };
export type ImagePage = { slices: ImageSlice[]; height: number };

// Prefer whole messages. An oversized bubble continues at a measured text-line boundary.
export function imagePages(messages: MeasuredMessage[], capacity: number): ImagePage[] {
  const pages: ImagePage[] = [];
  let page: ImagePage = { slices: [], height: 0 };
  const flush = () => { if (page.slices.length) pages.push(page); page = { slices: [], height: 0 }; };
  for (const message of messages) {
    if (page.height && message.height > capacity - page.height) flush();
    let offset = 0;
    while (offset < message.height) {
      const room = capacity - page.height, remaining = message.height - offset;
      let height = Math.min(room, remaining);
      if (remaining > room) {
        const boundary = message.breaks.filter(value => value > offset && value <= offset + room).at(-1);
        if (boundary !== undefined) height = boundary - offset;
      }
      page.slices.push({ id: message.id, offset, height }); page.height += height; offset += height;
      if (offset < message.height) flush();
    }
  }
  flush(); return pages;
}
