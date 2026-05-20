"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const URL_TOKEN = "tilka-samko";
const MAX_ATTEMPTS = 10;

type TileState = "correct" | "present" | "absent" | "empty";

type GuessResult = {
  letter: string;
  state: TileState;
};

function normalizeWord(value: string) {
  return value.trim().toLocaleUpperCase("sk-SK");
}

function splitLetters(value: string) {
  return Array.from(value);
}

function scoreGuess(secret: string, guess: string): GuessResult[] {
  const secretLetters = splitLetters(secret);
  const guessLetters = splitLetters(guess);
  const result: GuessResult[] = guessLetters.map((letter) => ({
    letter,
    state: "absent",
  }));

  const remaining = new Map<string, number>();

  secretLetters.forEach((letter, index) => {
    if (guessLetters[index] === letter) {
      result[index].state = "correct";
      return;
    }

    remaining.set(letter, (remaining.get(letter) ?? 0) + 1);
  });

  guessLetters.forEach((letter, index) => {
    if (result[index].state === "correct") {
      return;
    }

    const available = remaining.get(letter) ?? 0;
    if (available > 0) {
      result[index].state = "present";
      remaining.set(letter, available - 1);
    }
  });

  return result;
}

function getTileClass(state: TileState) {
  switch (state) {
    case "correct":
      return "border-emerald-500 bg-emerald-500 text-white";
    case "present":
      return "border-amber-400 bg-amber-400 text-black";
    case "absent":
      return "border-zinc-500 bg-zinc-600 text-white";
    default:
      return "border-zinc-300 bg-white text-zinc-900";
  }
}

export default function WordleSkPage() {
  const [hasValidToken, setHasValidToken] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [secretWord, setSecretWord] = useState("");
  const [currentGuess, setCurrentGuess] = useState("");
  const [guesses, setGuesses] = useState<GuessResult[][]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromQuery = params.get("token");
    const tokenFromHash = window.location.hash.replace(/^#/, "");

    setHasValidToken(
      tokenFromQuery === URL_TOKEN ||
        tokenFromHash === URL_TOKEN ||
        window.location.pathname.endsWith(`/${URL_TOKEN}`)
    );
  }, []);

  const gameStarted = secretWord.length > 0;
  const secretLength = splitLetters(secretWord).length;
  const isSolved = guesses.some((guess) =>
    guess.every((tile) => tile.state === "correct")
  );
  const isGameOver = isSolved || guesses.length >= MAX_ATTEMPTS;

  const rows = useMemo(() => {
    const preparedRows: GuessResult[][] = [...guesses];

    if (gameStarted && !isGameOver) {
      const letters = splitLetters(currentGuess).slice(0, secretLength);
      preparedRows.push(
        Array.from({ length: secretLength }, (_, index) => ({
          letter: letters[index] ?? "",
          state: "empty" as TileState,
        }))
      );
    }

    while (gameStarted && preparedRows.length < MAX_ATTEMPTS) {
      preparedRows.push(
        Array.from({ length: secretLength }, () => ({
          letter: "",
          state: "empty" as TileState,
        }))
      );
    }

    return preparedRows;
  }, [currentGuess, gameStarted, guesses, isGameOver, secretLength]);

  function startGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized = normalizeWord(secretInput);
    const letters = splitLetters(normalized);

    if (letters.length < 3) {
      setMessage("Tajné slovo musí mať aspoň 3 písmená.");
      return;
    }

    if (!/^[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ]+$/u.test(normalized)) {
      setMessage("Použi iba písmená bez medzier, čísiel a znamienok.");
      return;
    }

    setSecretWord(normalized);
    setSecretInput("");
    setCurrentGuess("");
    setGuesses([]);
    setMessage(`Hra pripravená. Hľadá sa slovo s ${letters.length} písmenami.`);
    setShowSecret(false);
  }

  function submitGuess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!gameStarted || isGameOver) {
      return;
    }

    const normalized = normalizeWord(currentGuess);
    const letters = splitLetters(normalized);

    if (letters.length !== secretLength) {
      setMessage(`Tip musí mať presne ${secretLength} písmen.`);
      return;
    }

    if (!/^[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ]+$/u.test(normalized)) {
      setMessage("Tip môže obsahovať iba slovenské písmená.");
      return;
    }

    const result = scoreGuess(secretWord, normalized);
    const nextGuesses = [...guesses, result];
    const solved = result.every((tile) => tile.state === "correct");

    setGuesses(nextGuesses);
    setCurrentGuess("");

    if (solved) {
      setMessage(`Výborne! Uhádnuté na ${nextGuesses.length}. pokus.`);
    } else if (nextGuesses.length >= MAX_ATTEMPTS) {
      setMessage(`Koniec hry. Tajné slovo bolo ${secretWord}.`);
    } else {
      setMessage(`Pokus ${nextGuesses.length}/${MAX_ATTEMPTS}. Pokračuj.`);
    }
  }

  function resetGame() {
    setSecretWord("");
    setSecretInput("");
    setCurrentGuess("");
    setGuesses([]);
    setMessage(null);
    setShowSecret(false);
  }

  if (!hasValidToken) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-50">
        <section className="mx-auto max-w-xl rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
          <p className="mb-2 text-sm uppercase tracking-[0.35em] text-amber-300">Matotam</p>
          <h1 className="mb-4 text-3xl font-bold">Wordle SK</h1>
          <p className="text-zinc-300">
            Táto mini hra je dostupná cez súkromný token. Použi link s tokenom
            <span className="font-mono text-amber-300"> ?token={URL_TOKEN}</span>.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#164e63,_#09090b_46%)] px-4 py-8 text-zinc-50">
      <section className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="rounded-3xl border border-cyan-300/20 bg-zinc-950/75 p-6 shadow-2xl backdrop-blur">
          <p className="mb-2 text-sm uppercase tracking-[0.35em] text-cyan-200">Matotam</p>
          <h1 className="text-4xl font-black tracking-tight">Wordle SK</h1>
          <p className="mt-3 text-zinc-300">
            Jednoduchá verzia pre deti: rodič zadá tajné slovo, potom sa skryje a hráči majú
            {" "}{MAX_ATTEMPTS} pokusov. Slovník sa nekontroluje, iba dĺžka a písmená.
          </p>
        </header>

        {!gameStarted ? (
          <form
            onSubmit={startGame}
            className="rounded-3xl border border-zinc-700 bg-zinc-950/85 p-6 shadow-xl"
          >
            <label className="block text-sm font-semibold text-zinc-200" htmlFor="secret-word">
              Tajné slovo
            </label>
            <input
              id="secret-word"
              value={secretInput}
              onChange={(event) => setSecretInput(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-xl font-bold uppercase tracking-widest text-white outline-none focus:border-cyan-300"
              autoComplete="off"
              autoFocus
              placeholder="napr. MAČKA"
              type={showSecret ? "text" : "password"}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="rounded-2xl bg-cyan-300 px-5 py-3 font-bold text-zinc-950 transition hover:bg-cyan-200"
                type="submit"
              >
                Spustiť hru
              </button>
              <button
                className="rounded-2xl border border-zinc-700 px-5 py-3 font-semibold text-zinc-200 transition hover:bg-zinc-800"
                type="button"
                onClick={() => setShowSecret((value) => !value)}
              >
                {showSecret ? "Skryť slovo" : "Ukázať pri písaní"}
              </button>
            </div>
          </form>
        ) : (
          <section className="rounded-3xl border border-zinc-700 bg-zinc-950/85 p-4 shadow-xl sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-zinc-400">Hádaj slovo</p>
                <p className="mt-1 text-zinc-300">
                  Dĺžka: <strong className="text-white">{secretLength}</strong> písmen · Pokusy:{" "}
                  <strong className="text-white">{guesses.length}/{MAX_ATTEMPTS}</strong>
                </p>
              </div>
              <button
                className="rounded-2xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800"
                type="button"
                onClick={resetGame}
              >
                Nové slovo
              </button>
            </div>

            <div className="mb-6 flex flex-col gap-2">
              {rows.map((row, rowIndex) => (
                <div className="flex justify-center gap-2" key={rowIndex}>
                  {row.map((tile, tileIndex) => (
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 text-xl font-black uppercase shadow sm:h-14 sm:w-14 sm:text-2xl ${getTileClass(
                        tile.state
                      )}`}
                      key={`${rowIndex}-${tileIndex}`}
                    >
                      {tile.letter}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <form onSubmit={submitGuess} className="flex flex-col gap-3 sm:flex-row">
              <input
                value={currentGuess}
                onChange={(event) => {
                  const normalized = normalizeWord(event.target.value);
                  setCurrentGuess(splitLetters(normalized).slice(0, secretLength).join(""));
                }}
                className="min-w-0 flex-1 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-center text-xl font-bold uppercase tracking-widest text-white outline-none focus:border-cyan-300 disabled:opacity-50"
                autoComplete="off"
                autoFocus
                disabled={isGameOver}
                placeholder="Tvoj tip"
              />
              <button
                className="rounded-2xl bg-cyan-300 px-6 py-3 font-bold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isGameOver}
                type="submit"
              >
                Skontrolovať
              </button>
            </form>
          </section>
        )}

        {message ? (
          <p className="rounded-2xl border border-cyan-300/20 bg-cyan-950/50 px-4 py-3 text-center text-cyan-50">
            {message}
          </p>
        ) : null}

        <section className="rounded-3xl border border-zinc-700 bg-zinc-950/75 p-5 text-sm text-zinc-300">
          <h2 className="mb-3 text-base font-bold text-white">Legenda</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <p><span className="mr-2 rounded bg-emerald-500 px-2 py-1 font-bold text-white">A</span> správne písmeno aj miesto</p>
            <p><span className="mr-2 rounded bg-amber-400 px-2 py-1 font-bold text-black">A</span> písmeno je inde</p>
            <p><span className="mr-2 rounded bg-zinc-600 px-2 py-1 font-bold text-white">A</span> písmeno tam nie je</p>
          </div>
        </section>
      </section>
    </main>
  );
}
