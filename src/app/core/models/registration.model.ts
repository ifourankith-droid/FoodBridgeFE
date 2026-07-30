import { Role } from './user.model';

export type RecipientType = 'Individual' | 'Organization';

/** Mutable draft held while the user progresses through the wizard. */
export interface RegistrationDraft {
  role: Role | null;
  name: string;
  mobile: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  recipientType: RecipientType;
  capacity: string;
  /** Location picked on the map (null until GPS/pin sets it). */
  latitude: number | null;
  longitude: number | null;
}

/** Payload sent to the backend on registration. */
export interface RegisterPayload {
  role: Role;
  name: string;
  mobile: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  recipientType?: RecipientType;
  capacity?: string;
}

export function emptyRegistrationDraft(): RegistrationDraft {
  return {
    role: null,
    name: '',
    mobile: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    recipientType: 'Individual',
    capacity: '',
    latitude: null,
    longitude: null,
  };
}
