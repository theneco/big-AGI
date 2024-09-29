import type { RenderBlockInputs } from './blocks.types';
import { heuristicAllMarkdownImageReferences } from './image/RenderImageURL';
import { heuristicIsBlockPureHTML } from './danger-html/RenderDangerousHtml';


export function parseBlocksFromText(text: string): RenderBlockInputs {

  // special case: this could be generated by a proxy that returns an HTML page instead of the API response
  if (heuristicIsBlockPureHTML(text))
    return [{ bkt: 'dang-html-bk', html: text }];

  // special case: markdown image references (e.g., ![alt text](https://example.com/image.png))
  const imageBkInputs = heuristicAllMarkdownImageReferences(text);
  if (imageBkInputs)
    return imageBkInputs;

  const regexPatterns = {
    // was: \w\x20\\.+-_ for tge filename, but was missing too much
    // REVERTED THIS: was: (`{3,}\n?|$), but was matching backticks within blocks. so now it must end with a newline or stop
    // This was the longest in use, and still we're based on it
    // codeBlock: /`{3,}([\S\x20]+)?\n([\s\S]*?)(`{3,}\n?|$)/g,
    // This is way more promising, but will either not perform a partial match (no match at all) or match a single line
    // codeBlock: /^( {0,3})`{3,}([^\n`]*)\n([\s\S]*?)(?:\n^\1`{3,}[^\S\n]*(?=\n|$))?/gm,
    codeBlock: /`{3,}([^\n`]*)\n([\s\S]*?)(`{3,}(?=[ *\n])|$)/g,
    htmlCodeBlock: /<!DOCTYPE html>([\s\S]*?)<\/html>/gi,
    svgBlock: /<svg (xmlns|width|viewBox)=([\s\S]*?)<\/svg>/g,
  };

  const blocks: RenderBlockInputs = [];
  let lastIndex = 0;

  while (true) {

    // find the first match (if any) trying all the regexes
    let match: RegExpExecArray | null = null;
    let matchType: keyof typeof regexPatterns | null = null;
    let earliestMatchIndex: number | null = null;

    for (const type in regexPatterns) {
      const regex = regexPatterns[type as keyof typeof regexPatterns];
      regex.lastIndex = lastIndex;
      const currentMatch = regex.exec(text);
      if (currentMatch && (earliestMatchIndex === null || currentMatch.index < earliestMatchIndex)) {
        match = currentMatch;
        matchType = type as keyof typeof regexPatterns;
        earliestMatchIndex = currentMatch.index;
      }
    }
    if (match === null)
      break;

    // anything leftover before the match is text
    if (match.index > lastIndex)
      blocks.push({ bkt: 'md-bk', content: text.slice(lastIndex, match.index) });

    // add the block
    switch (matchType) {
      case 'codeBlock':
        const blockTitle: string = (match[1] || '').trim();
        // note: we don't trim blockCode to preserve leading spaces, however if the last line is only made of spaces, we trim that
        const blockCode: string = match[2].replace(/\s+$/, '');
        const blockEnd: string = match[3];
        blocks.push({ bkt: 'code-bk', title: blockTitle, code: blockCode, isPartial: !blockEnd.startsWith('```') });
        break;

      case 'htmlCodeBlock':
        const preMatchHtml: string = `<!DOCTYPE html>${match[1]}</html>`;
        blocks.push({ bkt: 'code-bk', title: 'html', code: preMatchHtml, isPartial: false });
        break;

      case 'svgBlock':
        blocks.push({ bkt: 'code-bk', title: 'svg', code: match[0], isPartial: false });
        break;
    }

    // advance the pointer
    lastIndex = match.index + match[0].length;
  }

  // remainder is text
  if (lastIndex < text.length)
    blocks.push({ bkt: 'md-bk', content: text.slice(lastIndex) });

  return blocks;
}
