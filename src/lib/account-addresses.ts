export interface ShippingAddress {
  id: string;
  title: string; // e.g. "Home", "Office", "2nd Home", "Summer House"
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  isPrimary: boolean;
}

export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  birthDate: string; // Immutable once filled
}

export const MAX_SHIPPING_ADDRESSES = 5;

export const DEFAULT_COUNTRY = "Kazakhstan";
export const DEFAULT_CITY = "Almaty";

export const KAZAKHSTAN_CITIES = [
  "Almaty",
  "Astana",
  "Shymkent",
  "Karaganda",
  "Aktobe",
  "Taraz",
  "Pavlodar",
  "Ust-Kamenogorsk",
  "Semey",
  "Atyrau",
  "Kostanay",
  "Kyzylorda",
  "Uralsk",
  "Petropavl",
  "Aktau",
  "Temirtau",
  "Turkistan",
  "Kokshetau",
] as const;

export const AVAILABLE_COUNTRIES = [
  "Kazakhstan",
  "Uzbekistan",
  "Kyrgyzstan",
  "United States",
  "United Kingdom",
  "Germany",
  "France",
  "Canada",
  "United Arab Emirates",
  "Turkey",
  "Other",
] as const;

export function setPrimaryAddress(addresses: ShippingAddress[], primaryId: string): ShippingAddress[] {
  return addresses.map((addr) => ({
    ...addr,
    isPrimary: addr.id === primaryId,
  }));
}

export function addShippingAddress(
  addresses: ShippingAddress[],
  newAddress: Omit<ShippingAddress, "id"> & { id?: string }
): ShippingAddress[] {
  if (addresses.length >= MAX_SHIPPING_ADDRESSES) {
    throw new Error(`Maximum of ${MAX_SHIPPING_ADDRESSES} shipping addresses allowed.`);
  }

  const id = newAddress.id || `addr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const isFirst = addresses.length === 0;
  const isPrimary = isFirst || Boolean(newAddress.isPrimary);
  const title = newAddress.title?.trim() || "Address";

  const updatedList = addresses.map((addr) => (isPrimary ? { ...addr, isPrimary: false } : addr));

  updatedList.push({
    ...newAddress,
    title,
    id,
    isPrimary,
  });

  return updatedList;
}

export function updateShippingAddress(
  addresses: ShippingAddress[],
  updatedAddress: ShippingAddress
): ShippingAddress[] {
  const list = addresses.map((addr) => {
    if (addr.id === updatedAddress.id) {
      return {
        ...updatedAddress,
        title: updatedAddress.title?.trim() || "Address",
      };
    }
    if (updatedAddress.isPrimary) {
      return { ...addr, isPrimary: false };
    }
    return addr;
  });

  // Ensure at least one primary exists if list is not empty
  if (list.length > 0 && !list.some((a) => a.isPrimary)) {
    list[0].isPrimary = true;
  }

  return list;
}

export function deleteShippingAddress(addresses: ShippingAddress[], deleteId: string): ShippingAddress[] {
  const filtered = addresses.filter((addr) => addr.id !== deleteId);
  // If the deleted address was primary, designate the first remaining address as primary
  if (filtered.length > 0 && !filtered.some((a) => a.isPrimary)) {
    filtered[0] = { ...filtered[0], isPrimary: true };
  }
  return filtered;
}

export function updateProfileDetails(
  currentProfile: UserProfile,
  updates: Partial<UserProfile>
): UserProfile {
  // Birth date cannot be changed once filled during initial registration
  const nextBirthDate = currentProfile.birthDate ? currentProfile.birthDate : (updates.birthDate || "");

  return {
    ...currentProfile,
    ...updates,
    birthDate: nextBirthDate,
  };
}
