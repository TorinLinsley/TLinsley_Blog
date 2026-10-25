"use client";

import Comments from './Comments';

export default function MomentComments({ id }: { id: string }) {
  return <Comments page={id} />;
}