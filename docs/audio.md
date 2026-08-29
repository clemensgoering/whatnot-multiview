# Audio

[Guide](README.md) · [Installation](installation.md) · [First steps](getting-started.md) · **Audio** · [Layout](layout.md) · [Troubleshooting](troubleshooting.md)

---

This is the part the app exists for. Four streams playing at once is useless if
you cannot control who is talking.

## Per-tile controls

Every tile header carries its own audio strip.

![The controls in a tile header](images/04-tile-controls.png)

From left to right:

| Control | What it does |
| --- | --- |
| ‹ | Back, within this tile's history |
| ⌂ | Whatnot home page **in a new tile** — see [Navigation](getting-started.md#navigating-inside-a-tile) |
| 🔊 / 🔇 | Mute or unmute this tile |
| Slider | This tile's own volume, 0–100 (85 in the shot above) |
| ★ | Save the page this tile is showing to [favourites](getting-started.md#favourites) |
| 💬 | Show or hide the chat column |
| `S` | **Solo** — hear only this stream |
| ⛶ | Enlarge the tile, see [Layout](layout.md#focus-mode) |
| ⟳ | Reload the stream |
| ↗ | Open this stream in your system browser |
| ✕ | Remove the tile |

On narrow tiles — four columns on a small screen — the numeric volume and then
⟳ and ↗ drop out to keep the row usable. Widen the tile or use fewer columns to
get them back.

## Hiding the chat

💬 collapses the chat column so the video gets the whole tile. Press it again to
bring the chat back, and the choice is remembered per tile across restarts.

There is no official way to do this, so the app does not rely on class names —
Whatnot renames those without notice. It looks for the shape of the page instead
and tries three things in turn:

1. **A column right of the video.** Whatnot's desktop layout, which a wide tile
   or [focus mode](layout.md#focus-mode) gets.
2. **A scrollable list of many short items.** That is what a chat is, in any
   layout, and it needs no labels or class names at all.
3. **A message field** whose placeholder or ARIA label mentions chat, message or
   Nachricht, grown upwards to the block containing it.

### When automatic detection fails

**Shift-click 💬** and the tile enters picking mode: move the mouse until the
chat is outlined, then click it. Press <kbd>Esc</kbd> to cancel.

The choice is remembered for **all** tiles and across restarts, because every
Whatnot stream page has the same structure. If Whatnot rebuilds its layout and
the pick stops resolving, the automatic strategies take over again — and you can
simply pick once more.

**Alt-click 💬** copies a short structural report to your clipboard: viewport
size, which strategies matched, and the shape of the scrollable containers and
input fields on the page. It contains no chat messages and no account details.
Paste it into a
[bug report](https://github.com/clemensgoering/whatnot-multiview/issues) if the
detection misses.

If it cannot find a column, the button flashes red and nothing is hidden — see
[Troubleshooting](troubleshooting.md#the-chat-toggle-does-nothing).

## Solo

Solo is the fastest control in the app. Click `S` — or press the tile's number
key — and everything except that stream goes quiet.

![Solo on the second tile](images/05-solo.png)

The soloed tile gets a green border; the silenced ones dim their titles. Nothing
pauses: the other streams keep running, so you miss nothing when you switch back.

Press the same key again, or `0`, to release.

```
1 … 9   solo that tile (press again to release)
0       release solo
```

## Master level

The slider in the toolbar scales every tile at once, and 🔊 next to it (or `M`)
mutes everything. Use the master level to set a comfortable overall volume, and
the per-tile sliders to balance a loud seller against a quiet one.

## How the three layers combine

The rules, in order of precedence:

1. **Master mute** silences everything, no exceptions.
2. **Solo**, if active, silences every tile but the soloed one.
3. Otherwise a tile's own **mute** decides.

An audible tile then plays at `tile volume × master volume`. So a tile at 50 with
the master at 70 ends up at 35 % of full scale.

One convenience worth knowing: unmuting a tile while a *different* tile is soloed
releases the solo. Otherwise the click would appear to do nothing.

## What happens under the hood

Volume is applied by setting `volume` on the `<video>` elements inside the page,
re-applied by a short interval and a `MutationObserver` because Whatnot rebuilds
its player on reconnect.

Muting does not rely on that. It is applied at the webview level with
`setAudioMuted()`, so even if Whatnot changed its player entirely, muting and solo
would keep working — only the fine-grained levels would be affected.

---

← [First steps](getting-started.md) · Next: [Layout](layout.md) →
