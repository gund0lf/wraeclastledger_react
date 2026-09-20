# Safe strategy v2 fixture

`safe-strategy-v2.json` contains entirely synthetic server-projected current,
frozen and immutable-run DTOs. It exercises explicit zero investment, a loss,
duplicate scarabs, absent historical prices and populated loot with manual
item identity. The synthetic Atlas URL is not a usable build.

The `input` and `payload` entries are synthetic projection inputs for checking
first-run identity reconstruction; they are not public API response fields.
The reader tests validate response shapes and ensure private fields are rejected.

Additional server projections cover partial/all-null ancillary values and display
setups whose long title or regex makes setup-code import unavailable. Display
evidence must remain visible; null is unrecorded, never an invented zero or None.
