# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test http responses unit so this responsibility stays isolated, testable, and easy to evolve."""

from unittest import TestCase

from augmentedquill.api.v1.http_responses import error_json, ok_json


class HttpResponsesTest(TestCase):
    def test_ok_json_includes_ok_flag_and_extra(self):
        response = ok_json(status_code=201, value=1)
        self.assertEqual(response.status_code, 201)
        self.assertIn(b'"ok":true', response.body)
        self.assertIn(b'"value":1', response.body)

    def test_error_json_includes_detail_and_extra(self):
        response = error_json("bad", status_code=422, code="E_BAD")
        self.assertEqual(response.status_code, 422)
        self.assertIn(b'"ok":false', response.body)
        self.assertIn(b'"detail":"bad"', response.body)
        self.assertIn(b'"code":"E_BAD"', response.body)
