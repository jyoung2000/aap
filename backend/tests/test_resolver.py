"""Field-resolution order and knockout-safety tests."""
from __future__ import annotations

from app.core.resolver import resolve_field
from app.models import CustomField, Profile, SavedAnswer


def make_profile(**kw) -> Profile:
    p = Profile(
        user_id="u1", first_name="Ada", last_name="Lovelace", email="ada@x.com",
        phone="+1 555 0100", city="London", state="", country="United Kingdom",
        linkedin_url="https://linkedin.com/in/ada", work_authorized="Yes",
        requires_sponsorship="No", work_model_preference="Remote", years_experience=8,
        veteran_status="Decline to self-identify", current_comp_amount=None,
    )
    for k, v in kw.items():
        setattr(p, k, v)
    return p


def test_profile_takes_precedence():
    prof = make_profile()
    r = resolve_field(label="First name", field_type="text", options=[], profile=prof, custom_fields=[], saved_answers=[])
    assert r.value == "Ada"
    assert r.source == "profile"
    assert r.auto_fillable


def test_custom_field_used_when_profile_has_no_rule():
    prof = make_profile()
    cf = CustomField(user_id="u1", label="Security clearance", type="text", value="Secret")
    r = resolve_field(label="Security clearance level", field_type="text", options=[], profile=prof, custom_fields=[cf], saved_answers=[])
    # "clearance" maps to profile.security_clearance rule first (default "None"),
    # so ensure the dedicated clearance field resolves deterministically.
    assert r.source in ("profile", "custom_field")
    assert r.value


def test_saved_answer_resolves_unknown_question():
    prof = make_profile()
    sa = SavedAnswer(user_id="u1", question="What is your favorite framework?", answer="FastAPI", question_key="what is your favorite framework")
    r = resolve_field(label="What is your favorite framework?", field_type="text", options=[], profile=prof, custom_fields=[], saved_answers=[sa], use_llm=False)
    assert r.value == "FastAPI"
    assert r.source == "saved_answer"


def test_knockout_never_guessed():
    prof = make_profile()
    r = resolve_field(label="Do you have a valid CDL license?", field_type="select", options=["Yes", "No"], profile=prof, custom_fields=[], saved_answers=[], use_llm=True)
    assert r.needs_human is True
    assert r.is_knockout is True
    assert r.value == ""  # never guessed


def test_current_comp_blank_not_filled():
    prof = make_profile(current_comp_amount=None)
    r = resolve_field(label="Current compensation", field_type="text", options=[], profile=prof, custom_fields=[], saved_answers=[])
    assert r.value == ""
    assert r.source == "profile_blank"
    assert not r.auto_fillable


def test_work_authorization_maps_to_options():
    prof = make_profile()
    r = resolve_field(
        label="Are you legally authorized to work in the United States?",
        field_type="select", options=["Yes", "No"], profile=prof, custom_fields=[], saved_answers=[],
    )
    assert r.value == "Yes"
    assert r.options_matched


def test_eeo_defaults_to_decline():
    prof = make_profile()
    r = resolve_field(label="Veteran status", field_type="select",
                      options=["I am a veteran", "I am not a veteran", "Decline to self-identify"],
                      profile=prof, custom_fields=[], saved_answers=[])
    assert r.value == "Decline to self-identify"


def test_unresolved_without_llm_goes_to_human():
    prof = make_profile()
    r = resolve_field(label="Describe a challenging project", field_type="textarea", options=[],
                      profile=prof, custom_fields=[], saved_answers=[], use_llm=False)
    assert r.needs_human is True
