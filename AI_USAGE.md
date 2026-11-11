# AI-assisted build record

I have used the AI tool github copilot for the implementation and chatgpt for UI suggestion, below are the few prompt used for the implementation.


## Example prompts: 

- Create a skeleton project with client and server for UI and backend, it should meet the standard coding practices and folder structure, create a basic api structure as well for backend. Make sure that keep UI and backend separately with proper structure.

- Then create the below UI components for below requirement with proper component struture and create the backend APIs for building the same with routes, controller and services and utils folder structure.  

• A dashboard showing remaining quota
• An input to request enrichment for an indicator
• After a lookup slot is reserved: a countdown timer for the lease and a 'Run lookup' button
• Status messages for: queued (with position), lease expired, completed (showing the reputation result)


- Write the test cases for the these requirements with test cases given.

- Asked the copilot to use the sequelize ORM to connect DB and for quesries instead of handling raw queries.


## AI corrections and review points

- When asked copilot to create the backend APIs its used the sql raw queries and sqlite was not configured then explicitly asked AI to use sequelize ORM and its converted the raw quesries to sequelize queries and asked to utilize both sqlLite and postgress as database instead of using 1 option.

- Expiry and FIFO promotion are performed in the same transaction as the quota return. The status transition releases the active-indicator unique index entry before another request for that indicator can be accepted.

- The mock provider call is intentionally kept inside the transaction to avoid an expiry/run race in this short assessment. This is suitable only for the fast mock; a real provider integration should use a durable running state and idempotent completion flow, as documented in the README.

