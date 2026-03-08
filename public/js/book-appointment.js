
document.addEventListener('DOMContentLoaded',()=>{

 const btn=document.getElementById('bookAppointmentBtn');
 if(!btn) return;

 btn.addEventListener('click',()=>{
  const email=document.getElementById('emailMain')?.textContent || '';
  if(!email){
   alert('Booking email unavailable');
   return;
  }

  const subject=encodeURIComponent('Appointment Request');
  const body=encodeURIComponent('Hello, I would like to book an appointment.');

  window.location.href='mailto:'+email+'?subject='+subject+'&body='+body;
 });

});

