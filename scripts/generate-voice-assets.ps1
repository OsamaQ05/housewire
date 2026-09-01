$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Speech

$outputDirectory = Join-Path $PSScriptRoot '..\assets\audio'
$resolvedOutput = [System.IO.Path]::GetFullPath($outputDirectory)
[System.IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null

$phrases = [ordered]@{
  'word-ember.wav'  = 'Ember.'
  'word-hollow.wav' = 'Hollow.'
  'word-seven.wav'  = 'Seven.'
  'word-river.wav'  = 'River.'
  'word-lantern.wav' = 'Lantern.'
  'word-copper.wav' = 'Copper.'
  'word-window.wav' = 'Window.'
  'word-orbit.wav' = 'Orbit.'
  'dead-air-open.wav' = 'Service channel open. Keep the tuner outside the line.'
  'night-glass-open.wav' = 'Do not follow the reflection. Build the corridor together.'
}

foreach ($entry in $phrases.GetEnumerator()) {
  $target = Join-Path $resolvedOutput $entry.Key
  $voice = [System.Speech.Synthesis.SpeechSynthesizer]::new()
  try {
    $voice.Rate = -2
    $voice.Volume = 86
    $voice.SetOutputToWaveFile($target)
    $voice.Speak($entry.Value)
  }
  finally {
    $voice.Dispose()
  }
}

Get-Item ($phrases.Keys | ForEach-Object { Join-Path $resolvedOutput $_ }) |
  Select-Object Name, Length
