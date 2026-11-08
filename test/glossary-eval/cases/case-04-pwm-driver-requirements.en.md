# Requirements — PWM Driver (draft)

| ID | Requirement |
|---|---|
| R1 | The driver MUST expose a duty-cycle API in the range 0–100 %. |
| R2 | Two PWM channels MUST be able to run at different frequencies. |
| R3 | Dead Time MUST be configurable per channel. |
| R4 | The driver SHALL recover the default register values after a reset. |
| R5 | Do not disconnect the power supply during a firmware update. |
| R6 | Acceptance criteria: no shoot-through, resolution ≥ 10 bits, and idle level low. |
