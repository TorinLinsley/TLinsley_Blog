"use client";
import { useEffect } from 'react';
import { installAdminKeyFetch } from '../lib/adminKey';

if (typeof window !== 'undefined') {
  installAdminKeyFetch();
}

export default function ApiKeyInjector() {
  useEffect(() => {
    installAdminKeyFetch();
  }, []);
  return null;
}