'use client';

import { toast } from 'react-hot-toast';

export function notify({ type, message }: { type: 'success' | 'error'; message: string }) {
  if (type === 'success') {
    toast.success(message);
  } else {
    toast.error(message);
  }
}