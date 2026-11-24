"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  ApiRequestError,
  getActiveProfileId,
  parentApi,
  refreshProfiles,
  setActiveProfileId,
  useCachedProfiles,
} from "@/lib/profiles/client";
import { PIN_MAX, PIN_MIN, SETUP_CODE_MAX, type Profile } from "@/lib/profiles/shared";

/**
 * 부모 화면 (허브 공용). PIN을 확인해야 열린다.
 * PIN은 화면에만 잠깐 들고 있고, 바꾸는 요청마다 서버가 다시 확인한다.
 */

const MESSAGES: Record<string, string> = {
  wrong_pin: "PIN이 맞지 않아요.",
  pin_locked: "여러 번 틀려서 잠겼어요. 잠시 뒤에 다시 해 주세요. (틀릴수록 더 오래 잠겨요)",
  pin_not_set: "먼저 PIN을 만들어 주세요.",
  pin_already_set: "이미 PIN이 만들어졌어요. 새로 고침해 주세요.",
  wrong_setup_code: "설치 코드가 맞지 않아요. PC의 설치 화면이나 .env 파일의 SETUP_CODE 를 확인하세요.",
  invalid_input: `입력을 확인해 주세요. (PIN은 숫자 ${PIN_MIN}~${PIN_MAX}자리)`,
  not_found: "이미 지워진 프로필이에요.",
};

function message(err: unknown): string {
  if (err instanceof ApiRequestError) return MESSAGES[err.code] ?? "요청을 처리하지 못했어요.";
  return "서버에 연결할 수 없어요.";
}

const input =
  "h-12 w-48 rounded-xl border-2 border-slate-200 bg-white px-3 text-center text-xl tracking-widest outline-none focus:border-sky-400";
const button = "h-12 rounded-xl px-5 font-sans text-white shadow disabled:opacity-40";

export function ParentPanel() {
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    parentApi
      .pinStatus()
      .then((r) => {
        setPinSet(r.isSet);
        setNeedsCode(r.setupCodeRequired);
      })
      .catch((e) => setError(message(e)));
  }, []);

  if (pinSet === null) {
    return <Shell>{error ? <p className="text-rose-600">{error}</p> : <p>불러오는 중…</p>}</Shell>;
  }

  if (!unlocked) {
    const submit = async () => {
      setError(null);
      try {
        if (pinSet) await parentApi.verify(pin);
        else await parentApi.setPin(pin, needsCode ? { setupCode: code } : {});
        setPinSet(true);
        setUnlocked(true);
      } catch (e) {
        setError(message(e));
      }
    };
    return (
      <Shell>
        <p className="text-slate-600">
          {pinSet
            ? "부모 PIN을 입력하세요."
            : `처음이에요. 부모 PIN(숫자 ${PIN_MIN}~${PIN_MAX}자리)을 만들어 주세요. 아이에게 알려주지 마세요.`}
        </p>
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {!pinSet && needsCode && (
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={SETUP_CODE_MAX}
              placeholder="설치 코드"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
              className={input}
              aria-label="설치 코드 (PC 설치 화면에 나온 숫자)"
            />
          )}
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder={pinSet ? "PIN" : "새 PIN"}
            maxLength={PIN_MAX}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className={input}
            aria-label="부모 PIN"
          />
          <button type="submit" className={`${button} bg-sky-600`} disabled={pin.length < PIN_MIN || (!pinSet && needsCode && !code)}>
            {pinSet ? "열기" : "PIN 만들기"}
          </button>
        </form>
        {!pinSet && needsCode && (
          <p className="text-sm text-slate-500">설치 코드는 PC에서 setup.ps1 을 실행했을 때 화면에 나온 숫자예요 (C:\sugo\.env 의 SETUP_CODE).</p>
        )}
        {error && <p className="text-rose-600">{error}</p>}
      </Shell>
    );
  }

  return (
    <Shell>
      <Profiles pin={pin} />
      <ChangePin
        currentPin={pin}
        onChanged={(p) => {
          setPin(p);
        }}
      />
      <button type="button" className={`${button} self-start bg-slate-500`} onClick={() => { setUnlocked(false); setPin(""); }}>
        잠그기
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10 font-sans">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-4xl text-slate-800">⚙️ 부모 설정</h1>
        <Link href="/" className="rounded-xl bg-white px-4 py-2 shadow">
          처음 화면
        </Link>
      </header>
      {children}
    </main>
  );
}

function Profiles({ pin }: { pin: string }) {
  const profiles = useCachedProfiles();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    refreshProfiles().then((r) => {
      if (r.offline) setError("서버에 연결할 수 없어요.");
    });

  useEffect(() => {
    refreshProfiles().then((r) => {
      if (r.offline) setError("서버에 연결할 수 없어요.");
    });
  }, []);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      await load();
    } catch (e) {
      setError(message(e));
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow">
      <h2 className="text-xl font-bold text-slate-700">아이 프로필</h2>
      {profiles.length === 0 && <p className="text-slate-500">아직 프로필이 없어요. 한글 모험에서 만들 수 있어요.</p>}
      <ul className="flex flex-col gap-3">
        {profiles.map((p) => (
          <ProfileRow
            key={p.id}
            profile={p}
            onRename={(name) => run(() => parentApi.rename(p.id, name, pin), "이름을 바꿨어요.")}
            onReset={() => {
              if (!window.confirm(`${p.nickname}의 학습 기록을 모두 지울까요? 되돌릴 수 없어요.`)) return;
              void run(() => parentApi.reset(p.id, pin), "학습 기록을 초기화했어요.");
            }}
            onDelete={() => {
              if (!window.confirm(`${p.nickname} 프로필과 기록을 모두 지울까요? 되돌릴 수 없어요.`)) return;
              void run(async () => {
                await parentApi.remove(p.id, pin);
                if (getActiveProfileId() === p.id) setActiveProfileId(null);
              }, "프로필을 지웠어요.");
            }}
          />
        ))}
      </ul>
      {notice && <p className="text-emerald-700">{notice}</p>}
      {error && <p className="text-rose-600">{error}</p>}
    </section>
  );
}

function ProfileRow({
  profile,
  onRename,
  onReset,
  onDelete,
}: {
  profile: Profile;
  onRename: (name: string) => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(profile.nickname);
  return (
    <li className="flex flex-wrap items-center gap-2">
      <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} className={`${input} tracking-normal`} aria-label="별명" />
      <button type="button" className={`${button} bg-sky-600`} disabled={!name.trim() || name === profile.nickname} onClick={() => onRename(name.trim())}>
        이름 바꾸기
      </button>
      <button type="button" className={`${button} bg-amber-600`} onClick={onReset}>
        기록 초기화
      </button>
      <button type="button" className={`${button} bg-rose-600`} onClick={onDelete}>
        삭제
      </button>
    </li>
  );
}

function ChangePin({ currentPin, onChanged }: { currentPin: string; onChanged: (pin: string) => void }) {
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow">
      <h2 className="text-xl font-bold text-slate-700">PIN 바꾸기</h2>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="password"
          inputMode="numeric"
          maxLength={PIN_MAX}
          value={next}
          onChange={(e) => setNext(e.target.value.replace(/\D/g, ""))}
          className={input}
          aria-label="새 PIN"
        />
        <button
          type="button"
          className={`${button} bg-sky-600`}
          disabled={next.length < PIN_MIN}
          onClick={async () => {
            try {
              await parentApi.setPin(next, { currentPin });
              onChanged(next);
              setNext("");
              setMsg("PIN을 바꿨어요.");
            } catch (e) {
              setMsg(message(e));
            }
          }}
        >
          바꾸기
        </button>
      </div>
      {msg && <p className="text-slate-600">{msg}</p>}
    </section>
  );
}
