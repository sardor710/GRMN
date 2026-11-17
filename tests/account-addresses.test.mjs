import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  setPrimaryAddress,
  addShippingAddress,
  deleteShippingAddress,
  updateProfileDetails,
  MAX_SHIPPING_ADDRESSES,
  DEFAULT_COUNTRY,
  DEFAULT_CITY,
} from "../src/lib/account-addresses.ts";

describe("Account Addresses & Profile Logic", () => {
  const initialAddresses = [
    {
      id: "addr-1",
      title: "Home",
      name: "Alex Rivera",
      street: "Dostyk Ave 105",
      city: "Almaty",
      state: "Almaty",
      zip: "050000",
      country: "Kazakhstan",
      phone: "+7 (727) 355-1234",
      isPrimary: true,
    },
    {
      id: "addr-2",
      title: "Office",
      name: "Alex Rivera",
      street: "Mangilik El Ave 55",
      city: "Astana",
      state: "Astana",
      zip: "010000",
      country: "Kazakhstan",
      phone: "+7 (7172) 79-5555",
      isPrimary: false,
    },
  ];

  it("should enforce maximum cap of 5 shipping addresses and preserve titles", () => {
    assert.equal(MAX_SHIPPING_ADDRESSES, 5);

    let list = [...initialAddresses];
    // Add 3 more up to 5 with titles like 2nd Home
    list = addShippingAddress(list, {
      id: "addr-3",
      title: "2nd Home",
      name: "Alex Rivera",
      street: "Tauelsizdik 12",
      city: "Shymkent",
      state: "Shymkent",
      zip: "160000",
      country: "Kazakhstan",
      phone: "+7 (7252) 55-0123",
      isPrimary: false,
    });
    list = addShippingAddress(list, {
      id: "addr-4",
      title: "Summer House",
      name: "Alex Rivera",
      street: "Lake Balkhash St 8",
      city: "Karaganda",
      state: "Karaganda",
      zip: "100000",
      country: "Kazakhstan",
      phone: "+7 (7212) 55-0144",
      isPrimary: false,
    });
    list = addShippingAddress(list, {
      id: "addr-5",
      title: "Warehouse",
      name: "Alex Rivera",
      street: "Abay St 45",
      city: "Aktobe",
      state: "Aktobe",
      zip: "030000",
      country: "Kazakhstan",
      phone: "+7 (7132) 55-0155",
      isPrimary: false,
    });
    assert.equal(list.length, 5);
    assert.equal(list[2].title, "2nd Home");
    assert.equal(list[3].title, "Summer House");

    // Attempting to add 6th address must throw error
    assert.throws(() => {
      addShippingAddress(list, {
        id: "addr-6",
        title: "Overflow",
        name: "Alex Rivera",
        street: "Baitursynov St 1",
        city: "Almaty",
        state: "Almaty",
        zip: "050012",
        country: "Kazakhstan",
        phone: "+7 (727) 999-9999",
        isPrimary: false,
      });
    }, /Maximum of 5 shipping addresses/);
  });

  it("should set primary tick so only one address is primary", () => {
    const updated = setPrimaryAddress(initialAddresses, "addr-2");
    const addr1 = updated.find((a) => a.id === "addr-1");
    const addr2 = updated.find((a) => a.id === "addr-2");

    assert.equal(addr1?.isPrimary, false);
    assert.equal(addr2?.isPrimary, true);
    assert.equal(updated.filter((a) => a.isPrimary).length, 1);
  });

  it("should auto-promote remaining address to primary if primary address is deleted", () => {
    const remaining = deleteShippingAddress(initialAddresses, "addr-1");
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, "addr-2");
    assert.equal(remaining[0].isPrimary, true);
  });

  it("should have default country Kazakhstan and city Almaty", () => {
    assert.equal(DEFAULT_COUNTRY, "Kazakhstan");
    assert.equal(DEFAULT_CITY, "Almaty");
  });

  it("should update profile details for city, country, phone, and name", () => {
    const initialProfile = {
      name: "Alex Rivera",
      email: "alex.rivera@example.com",
      phone: "+7 (727) 355-1234",
      country: "Kazakhstan",
      city: "Almaty",
      birthDate: "1994-05-18",
    };

    const updated = updateProfileDetails(initialProfile, {
      name: "Alexander Rivera",
      city: "Astana",
      phone: "+7 (7172) 99-8877",
    });

    assert.equal(updated.name, "Alexander Rivera");
    assert.equal(updated.city, "Astana");
    assert.equal(updated.country, "Kazakhstan");
    assert.equal(updated.phone, "+7 (7172) 99-8877");
  });

  it("should lock birth date after initial registration and never allow overwrite", () => {
    const initialProfile = {
      name: "Alex Rivera",
      email: "alex.rivera@example.com",
      phone: "+7 (727) 355-1234",
      country: "Kazakhstan",
      city: "Almaty",
      birthDate: "1994-05-18",
    };

    // Attempting to change birthDate should be ignored
    const updated = updateProfileDetails(initialProfile, {
      birthDate: "2002-01-01",
    });

    assert.equal(updated.birthDate, "1994-05-18");
  });

  it("should allow setting birth date if it was initially empty", () => {
    const initialProfile = {
      name: "New User",
      email: "new.user@example.com",
      phone: "+7 (727) 000-0000",
      country: "Kazakhstan",
      city: "Almaty",
      birthDate: "",
    };

    const updated = updateProfileDetails(initialProfile, {
      birthDate: "1998-11-25",
    });

    assert.equal(updated.birthDate, "1998-11-25");

    // Second attempt cannot change it
    const secondUpdate = updateProfileDetails(updated, {
      birthDate: "2005-12-12",
    });
    assert.equal(secondUpdate.birthDate, "1998-11-25");
  });
});
