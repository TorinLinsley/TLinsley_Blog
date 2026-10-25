"use client";

import Comments from './Comments';

export default function LabComments({ pageId }: { pageId?: string }) {
  const key = pageId && pageId.trim() ? pageId.trim() : 'index';
  return <Comments page={key.startsWith('/') ? key : `/tree/${key}`} />;
}