import type { PipelineV2Db } from "../types";
import { sha256 } from "../utils/hash";
import { estimateTokens } from "../utils/tokens";

export interface TextChunk {
  heading: string | null;
  text: string;
  chunkIndex: number;
  estimatedTokens: number;
  charCount: number;
  chunkHash: string;
}

export interface ChunkBillTextOptions {
  billExternalIdPrefix?: string;
}

function isHeading(line: string): boolean {
  const trimmed = line.trim();
  return /^#{1,6}\s+/.test(trimmed) || /^Section\s+\d+/i.test(trimmed) || /^SEC\.\s+\d+/i.test(trimmed);
}

function splitIntoSections(text: string): Array<{ heading: string | null; body: string }> {
  const lines = text.split("\n");
  const sections: Array<{ heading: string | null; body: string }> = [];
  let currentHeading: string | null = null;
  let currentBody: string[] = [];

  const flush = (): void => {
    if (currentBody.length === 0) return;
    sections.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
    currentBody = [];
  };

  for (const line of lines) {
    if (isHeading(line)) {
      flush();
      currentHeading = line.trim();
      continue;
    }
    currentBody.push(line);
  }
  flush();

  if (sections.length === 0 && text.trim().length > 0) {
    sections.push({ heading: null, body: text.trim() });
  }
  return sections;
}

async function chunkSection(heading: string | null, body: string, maxChars: number, startIndex: number): Promise<TextChunk[]> {
  const chunks: TextChunk[] = [];
  const paragraphs = body.split(/\n{2,}/g);
  let current = "";
  let chunkIndex = startIndex;

  const pushChunk = async (content: string): Promise<void> => {
    const normalized = content.trim();
    if (!normalized) return;
    chunks.push({
      heading,
      text: normalized,
      chunkIndex,
      estimatedTokens: estimateTokens(normalized),
      charCount: normalized.length,
      chunkHash: await sha256(`${heading ?? ""}:${normalized}`)
    });
    chunkIndex += 1;
  };

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).length <= maxChars) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
      continue;
    }
    await pushChunk(current);
    current = paragraph;
  }

  await pushChunk(current);
  return chunks;
}

export async function chunkBillText(
  db: PipelineV2Db,
  maxCharsPerChunk = 2200,
  options: ChunkBillTextOptions = {}
): Promise<number> {
  const params: unknown[] = [];
  let sql = `
    SELECT v.id, v.bill_id, v.text_content
    FROM v2_bill_versions v
    JOIN v2_bills b ON b.id = v.bill_id
    WHERE v.text_content IS NOT NULL AND v.text_content <> ''
  `;
  if (options.billExternalIdPrefix) {
    params.push(`${options.billExternalIdPrefix}%`);
    sql += " AND b.external_id LIKE $1";
  }
  sql += " ORDER BY v.id ASC";

  const versionRows = await db.query<{ id: number; bill_id: number; text_content: string }>(
    sql,
    params
  );

  let chunkCount = 0;
  for (const row of versionRows.rows) {
    const sections = splitIntoSections(row.text_content);
    let chunkIndex = 0;
    for (const section of sections) {
      const sectionChunks = await chunkSection(section.heading, section.body, maxCharsPerChunk, chunkIndex);
      for (const chunk of sectionChunks) {
        await db.query(
          `
          INSERT INTO v2_bill_text_chunks (
            bill_id,
            bill_version_id,
            chunk_index,
            heading,
            chunk_text,
            estimated_tokens,
            char_count,
            chunk_hash
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (bill_version_id, chunk_index) DO UPDATE SET
            heading = EXCLUDED.heading,
            chunk_text = EXCLUDED.chunk_text,
            estimated_tokens = EXCLUDED.estimated_tokens,
            char_count = EXCLUDED.char_count,
            chunk_hash = EXCLUDED.chunk_hash,
            updated_at = NOW()
          `,
          [row.bill_id, row.id, chunk.chunkIndex, chunk.heading, chunk.text, chunk.estimatedTokens, chunk.charCount, chunk.chunkHash]
        );
        chunkCount += 1;
      }
      chunkIndex += sectionChunks.length;
    }
  }
  return chunkCount;
}
