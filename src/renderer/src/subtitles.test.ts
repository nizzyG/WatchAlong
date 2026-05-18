import { describe, expect, it } from 'vitest'
import { getActiveSubtitleCue, parseSubtitleText } from './subtitles'

describe('subtitles', () => {
  it('parses SRT cues with multi-line text', () => {
    const cues = parseSubtitleText(`1
00:00:01,000 --> 00:00:03,500
First line
Second line

2
00:00:04,000 --> 00:00:05,000
Next`)

    expect(cues).toEqual([
      { start: 1, end: 3.5, text: 'First line\nSecond line' },
      { start: 4, end: 5, text: 'Next' }
    ])
  })

  it('parses VTT cues and strips markup', () => {
    const cues = parseSubtitleText(`WEBVTT

cue-1
00:00:10.000 --> 00:00:11.250 align:center
<v Speaker>Hello &amp; welcome</v>`)

    expect(cues).toEqual([{ start: 10, end: 11.25, text: 'Hello & welcome' }])
  })

  it('ignores invalid cues and selects the active cue', () => {
    const cues = parseSubtitleText(`bad
00:00:03,000 --> 00:00:02,000
Nope

00:00:04,000 --> 00:00:06,000
Yes`)

    expect(cues).toHaveLength(1)
    expect(getActiveSubtitleCue(cues, 5)?.text).toBe('Yes')
    expect(getActiveSubtitleCue(cues, 6)).toBeNull()
  })
})
