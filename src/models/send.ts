

export interface Send {
  id: string; // uniq id of Send
  phone: string; // phone number of receiver
  satoshis: number; // how much sats receiver will get
  created: number; // timestamp when Send was initiated
  refill_bolt11: string; // lightning invoice for sender to pay
  refill_bolt11_paid: boolean; // whether invoice is paid by sender
  refill_satoshis: number; // sender's invoice amount. includes service fees and sms price
  withdraw_bolt11: string; // ln invoice provided by receiver to receive sats
  withdraw_result: object; // response of LND when trying to pay `withdraw_bolt11`
  withdraw_bolt11_paid: boolean; // whether we think we paid bolt11 invoice successfully
}