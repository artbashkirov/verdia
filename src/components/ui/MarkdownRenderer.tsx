'use client';

import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Markdown parser for chat messages with proper nested list support
export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const parseInline = (text: string): (string | React.ReactElement)[] => {
    const parts: (string | React.ReactElement)[] = [];
    let remaining = text;
    let inlineKey = 0;

    // Process bold (**text**)
    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      
      if (boldMatch && boldMatch.index !== undefined) {
        if (boldMatch.index > 0) {
          parts.push(remaining.slice(0, boldMatch.index));
        }
        parts.push(
          <strong key={`b-${inlineKey++}`} className="font-semibold">
            {boldMatch[1]}
          </strong>
        );
        remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
      } else {
        parts.push(remaining);
        break;
      }
    }

    return parts;
  };

  const parseMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactElement[] = [];
    let key = 0;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      
      // Check for numbered list start (matches "1.", "2.", etc. at the beginning)
      const numberedMatch = line.match(/^(\d+)[\.\)]\s+(.+)$/);
      if (numberedMatch) {
        // Collect the entire numbered list with nested items
        const listItems: Array<{ content: string; subItems: string[] }> = [];
        
        while (i < lines.length) {
          const currentLine = lines[i];
          const numMatch = currentLine.match(/^(\d+)[\.\)]\s+(.+)$/);
          
          if (numMatch) {
            // New numbered item
            listItems.push({ content: numMatch[2], subItems: [] });
            i++;
            
            // Check for sub-items (bullet points with *, -, or \*)
            while (i < lines.length) {
              const subLine = lines[i];
              // Match bullet points: "* text", "- text", "\* text"
              const bulletMatch = subLine.match(/^(?:\\?\*|-)\s+(.+)$/);
              
              if (bulletMatch) {
                listItems[listItems.length - 1].subItems.push(bulletMatch[1]);
                i++;
              } else if (subLine.trim() === '') {
                // Empty line - check if next non-empty is bullet or numbered
                let nextIndex = i + 1;
                while (nextIndex < lines.length && lines[nextIndex].trim() === '') {
                  nextIndex++;
                }
                if (nextIndex < lines.length) {
                  const nextLine = lines[nextIndex];
                  // If next is bullet, it's a sub-item of current numbered item
                  if (nextLine.match(/^(?:\\?\*|-)\s+/)) {
                    i++;
                    continue;
                  }
                  // If next is numbered, we'll continue the main numbered list
                  if (nextLine.match(/^\d+[\.\)]\s+/)) {
                    i = nextIndex;
                    break;
                  }
                }
                // Otherwise, exit sub-items loop
                break;
              } else {
                break;
              }
            }
          } else if (currentLine.trim() === '') {
            // Check if next non-empty line is a numbered item
            let nextIndex = i + 1;
            while (nextIndex < lines.length && lines[nextIndex].trim() === '') {
              nextIndex++;
            }
            if (nextIndex < lines.length && lines[nextIndex].match(/^\d+[\.\)]\s+/)) {
              i = nextIndex;
              continue;
            }
            break;
          } else {
            break;
          }
        }
        
        // Render the numbered list with sequential numbering
        elements.push(
          <ol key={key++} className="list-none ml-0 my-3 space-y-3">
            {listItems.map((item, idx) => (
              <li key={idx} className="flex">
                <span className="mr-2 flex-shrink-0 font-medium">{idx + 1}.</span>
                <div className="flex-1">
                  <span>{parseInline(item.content)}</span>
                  {item.subItems.length > 0 && (
                    <ul className="list-disc ml-5 mt-2 space-y-1">
                      {item.subItems.map((sub, subIdx) => (
                        <li key={subIdx}>{parseInline(sub)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // Check for standalone bullet list (*, -, or \*)
      const bulletMatch = line.match(/^(?:\\?\*|-)\s+(.+)$/);
      if (bulletMatch) {
        const bulletItems: string[] = [];
        
        while (i < lines.length) {
          const currentLine = lines[i];
          const bMatch = currentLine.match(/^(?:\\?\*|-)\s+(.+)$/);
          
          if (bMatch) {
            bulletItems.push(bMatch[1]);
            i++;
          } else if (currentLine.trim() === '') {
            // Check if next non-empty is also a bullet
            let nextIndex = i + 1;
            while (nextIndex < lines.length && lines[nextIndex].trim() === '') {
              nextIndex++;
            }
            if (nextIndex < lines.length && lines[nextIndex].match(/^(?:\\?\*|-)\s+/)) {
              i = nextIndex;
              continue;
            }
            break;
          } else {
            break;
          }
        }
        
        elements.push(
          <ul key={key++} className="list-disc ml-5 my-2 space-y-1">
            {bulletItems.map((item, idx) => (
              <li key={idx}>{parseInline(item)}</li>
            ))}
          </ul>
        );
        continue;
      }

      // Empty line
      if (line.trim() === '') {
        i++;
        continue;
      }

      // Regular paragraph
      elements.push(
        <p key={key++} className="mb-3 last:mb-0">
          {parseInline(line)}
        </p>
      );
      i++;
    }

    return elements;
  };

  return (
    <div className={`text-[16px] lg:text-[16px] leading-[24px] lg:leading-[24px] break-words overflow-wrap-anywhere document-content ${className}`}>
      {parseMarkdown(content)}
    </div>
  );
}
