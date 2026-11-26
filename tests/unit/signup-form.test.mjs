// Owner 2026-11-26 (plan docs/plans/2026-11-26-signup-orders-pickup-devices-xl.md, D1): one-page sign-up. Every field is
// on one screen; the code is sent for the typed phone and checked by the server together with the details.
import assert from "node:assert/strict";
import test from "node:test";
import { componentFixture, nodes, nodeText } from "../helpers/component-fixture.mjs";
import * as accountClient from "../../src/lib/account-client.ts";
import * as signupRules from "../../src/lib/signup-rules.ts";
const { signUpProblems } = signupRules;

const file = new URL("../../src/components/account/SignUpForm.tsx", import.meta.url);
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); };

async function mount(routes) {
  const calls = [], pushed = [];
  const fetcher = async (url, init = {}) => {
    const key = `${init.method ?? "GET"} ${url}`;
    calls.push({ key, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const [status, body] = routes[key] ?? [404, { error: { code: "NOT_FOUND", message: "Not found" } }];
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  const fixture = componentFixture(file, { fetcher, modules: { "@/lib/signup-rules": signupRules, "@/lib/account-client": accountClient, "@/i18n/navigation": { Link: "a", useRouter: () => ({ push: href => pushed.push(href) }) } } });
  let tree = fixture.render();
  for (const effect of [...fixture.effects]) effect();
  await settle(); tree = fixture.render();
  const view = {
    calls, pushed, text: () => nodeText(tree), get tree() { return tree; },
    input(name, value) { nodes(tree).find(node => node.props?.name === name && node.type === "input" && node.props.type !== "radio").props.onChange({ target: { value } }); tree = fixture.render(); },
    choose(value) { nodes(tree).find(node => node.type === "input" && node.props.type === "radio" && node.props.value === value).props.onChange(); tree = fixture.render(); },
    async click(label) { const button = nodes(tree).find(node => node.type === "button" && nodeText(node).includes(label)); assert.ok(button, label); await button.props.onClick(); await settle(); tree = fixture.render(); },
    async submit() { await nodes(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); await settle(); tree = fixture.render(); },
  };
  return view;
}

test("validation: name, international phone, a sent code, email; birthday optional but within 10–120 years", () => {
  const ok = { name: "A", phone: "+7 700 000 0001", code: "1234", email: "a@example.invalid", gender: "", birthDate: "" };
  assert.deepEqual(signUpProblems(ok, true), {});
  assert.deepEqual(signUpProblems({ ...ok, name: " ", phone: "8700", email: "x" }, false), { name: "name", phone: "phone", code: "codeFirst", email: "email" });
  assert.deepEqual(signUpProblems({ ...ok, code: "12" }, true), { code: "code" });
  assert.deepEqual(signUpProblems({ ...ok, birthDate: new Date().toISOString().slice(0, 10) }, true), { birthDate: "birthDate" });
});

test("every field is on the page; Send code texts the typed phone; Create account sends details, code, gender and birthday", async () => {
  const view = await mount({
    "GET /api/auth/grmn/mode": [200, { testCode: true, signUp: true, code: "1234" }],
    "POST /api/auth/grmn/phone/send": [200, { challengeId: "00000000-0000-4000-8000-0000000000aa", testCode: true }],
    "POST /api/auth/grmn/signup": [200, { state: "authenticated" }],
  });
  for (const name of ["name", "phone", "code", "email", "birthDate"]) assert.ok(nodes(view.tree).some(node => node.props?.name === name), name);
  assert.deepEqual(nodes(view.tree).filter(node => node.props?.type === "radio").map(node => node.props.value), ["male", "female", "unspecified"]);
  assert.match(view.text(), /Enter code 1234/);
  assert.doesNotMatch(view.text(), /\btest\b/i, "customers never read test");
  await view.submit();
  assert.match(view.text(), /Press “Send code” and enter the code/);
  assert.ok(!view.calls.some(call => call.key === "POST /api/auth/grmn/signup"), "nothing is sent before the code");
  view.input("name", " New Customer "); view.input("phone", "+7 700 000 0009"); view.input("email", "new@example.invalid");
  await view.click("Send code");
  assert.deepEqual(view.calls.find(call => call.key === "POST /api/auth/grmn/phone/send").body, { phoneNumber: "+77000000009", purpose: "sign_in" });
  view.input("code", "1234"); view.choose("female"); view.input("birthDate", "1990-05-17");
  await view.submit();
  assert.deepEqual(view.calls.find(call => call.key === "POST /api/auth/grmn/signup").body,
    { name: "New Customer", email: "new@example.invalid", phoneNumber: "+77000000009", challengeId: "00000000-0000-4000-8000-0000000000aa", code: "1234", gender: "female", birthDate: "1990-05-17" });
  assert.deepEqual(view.pushed, ["/account"]);
});

test("when codes cannot be sent at all, the page says sign-up is unavailable", async () => {
  const view = await mount({ "GET /api/auth/grmn/mode": [200, { testCode: false, signUp: false }] });
  assert.match(view.text(), /Sign-up is temporarily unavailable/);
  assert.ok(!nodes(view.tree).some(node => node.type === "form"));
});
