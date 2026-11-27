# Financial formulas

Currency is USD. API rates are decimals and the UI shows percentages. Periodic assumptions are monthly unless labeled otherwise. Undefined ratios display as a dash. The app performs pre-income-tax underwriting with fixed rates and no appreciation assumption.

## Buy and hold

- Initial cost equals purchase, acquisition closing, rehab and rehab contingency. Initial cash equals cost less rental loan principal.
- Effective rent equals gross rent × (1 − vacancy). Management and routine maintenance are percentages of effective rent. Fixed costs include taxes, insurance, utilities, HOA and other owner-paid operating costs.
- NOI equals effective rent less operating expenses. Cash flow equals NOI less capital expenditure reserves and loan debt service. Capex reserves are a separate percentage of effective rent. Annual figures use twelve months.
- Fixed-rate debt service is `P × r / (1 − (1 + r)^−n)` for monthly interest rate `r`, principal `P` and term `n`. At zero interest it is `P / n`. First-year principal reduction equals original principal less the balance following up to twelve payments.
- Cash-on-cash equals annual cash flow / invested cash. Cap rate equals annual NOI / initial cost. DSCR equals monthly NOI / monthly debt service. Gross yield equals annual scheduled rent / initial cost. As-is equity equals estimated as-is value less assumed loan principal.
- Break-even occupancy equals (fixed expenses + debt service) / (scheduled rent × remaining share after management, maintenance and capex percentages). Values above 100% indicate the current assumptions cannot meet break-even.
- Standalone stresses test rent down 10%, vacancy up five percentage points, taxes up 20%, insurance up 25%, maintenance up five points and interest up two points.

## Flip

- Monthly holding expenses include the property operating costs plus additional holding expenses. The loan and separate HELOC accrue simple interest on the modeled full balances over the holding period. Change the balances to model different draws. Origination is applied once. Loan principal funds the project without increasing expenses.
- Project investment before selling equals purchase + closing + rehab and contingency + financing fees + hold expenses and interest. Disposition costs equal gross resale × variable selling rate + fixed disposition expenses.
- Gross profit is resale less purchase and rehab with contingency. Net profit is resale less project and disposition expenses. ROI equals net profit / all-in cost including disposition. Cash return equals net profit / (pre-sale project cost less modeled borrowing). It does not model the timing of capital draws. Annualized return compounds cash return over 12 / holding months when defined and the project lasts at least three months with at least $1 of invested cash.
- Break-even sale equals (project cost + fixed disposition) / (1 − variable disposition rate). Maximum offer equals net resale less nonpurchase project expenses and target profit, floored at zero. Opening offer discounts that amount by the configured opening discount. Financing principal and other assumptions are held fixed when deriving the offer. Re-underwrite at the proposed contract price.
- The 70% comparison equals 70% × ARV − rehab with contingency. Sensitivity recalculates holding costs at 3, 6, 9 and 12 months. Separate shocks apply 10% lower resale and 20% higher rehab inclusive of contingency.

## BRRRR

- Initial cost includes acquisition, renovation, contingency, financing fees and carrying expense through the greater of the modeled holding term and the refinance seasoning period. It assumes no lease-up proceeds during that period. Initial cash is total initial cost less the combined acquisition loan and HELOC balances.
- Refinance proceeds equal stabilized value × refinance LTV. Net capital recovered equals proceeds less debt payoff and refinance costs. Remaining cash equals initial cash less net recovery. Post-refinance equity equals stabilized value less refinance principal. Capital recycling equals net recovery / initial cash. Cash-on-cash is undefined when no cash remains invested.
- Post-refinance amortization and rental ratios use refinance terms. Appraisal sensitivity applies a 10% value reduction to the modeled proceeds with other terms fixed. Separate rental downside stresses are recalculated after financing.
- Qualification requires reviewed refinance eligibility and an LTV at or below the configured limit. The model estimates terms and cash requirements. Confirm seasoning, eligible costs, appraisal, liquidity and lender terms independently.

## Assignment and recommendation

- Net assignment proceeds equal the modeled fee less expenses. The strategy model is available only with owner confirmation that assignment is permitted.
- Shared gates require owner review and dated source evidence. Rental and BRRRR add financial gates. When multiple strategies clear, the recommendation prioritizes Buy and Hold, BRRRR, Flip and Assignment in that order. Scores aid ranking within a strategy and cannot replace qualification review.
