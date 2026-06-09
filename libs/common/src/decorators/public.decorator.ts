import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'is_public';

// Mark a route as not requiring an authenticated identity (e.g. /health).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
