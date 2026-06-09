import { SetMetadata } from '@nestjs/common';

export const RAW_KEY = 'raw_response';

// Skip the global { data, meta } envelope for this handler (e.g. when returning
// a raw PEM body the gateway consumes verbatim).
export const Raw = () => SetMetadata(RAW_KEY, true);
