# Spec Delta

## MODIFIED Requirements

### Requirement: Redraw only when something on screen changed
The bar SHALL be redrawn only when a reading differs from the last one, or a countdown or pace band that is on screen has moved. A reading identical to the last SHALL NOT cause a redraw, and neither SHALL a passing minute with no countdown text or pace band changed, nor a usage fetch that stores only its own bookkeeping.

#### Scenario: Same reading again
- **WHEN** a measurement arrives with the same context tokens and usage percentages as the last
- **THEN** the bar is not redrawn

#### Scenario: One value moved
- **WHEN** a measurement arrives where only the context tokens differ
- **THEN** only the context reading is updated, and the usage readings are left as they were

#### Scenario: A minute with nothing to show
- **WHEN** a minute passes and no window's countdown text or pace band changed
- **THEN** the bar is not redrawn

#### Scenario: A countdown moved
- **WHEN** a minute passes and the 5h countdown changed from 2h40m to 2h39m
- **THEN** the bar is redrawn

#### Scenario: Usage fetch finds nothing new
- **WHEN** the 5-minute usage fetch runs and returns the same limits as the last
- **THEN** the bar is not redrawn, and the next fetch still waits out the 5-minute window

## Pending after the experiment

The hover requirement ("Desktop pill hover") is not changed here. Task 3 of this change replaces this note with a MODIFIED or REMOVED delta once the user reports whether the flicker stopped.
